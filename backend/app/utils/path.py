import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path


class PathTraversalError(ValueError):
    pass


def safe_path(user_path: str, base_directory: Path) -> Path:
    if "\x00" in user_path:
        raise PathTraversalError("Path contains null bytes")

    if not user_path or not user_path.strip():
        raise PathTraversalError("Path is empty or whitespace-only")

    stripped = user_path.strip().strip(".")
    if not stripped:
        raise PathTraversalError("Path contains only dots")

    if len(user_path.encode("utf-8")) > 4096:
        raise PathTraversalError("Path exceeds maximum length (4096 bytes)")

    # reject windows reserved names for portability
    basename = Path(user_path).stem.upper()
    windows_reserved = {
        "CON", "PRN", "AUX", "NUL",
        *(f"COM{i}" for i in range(1, 10)),
        *(f"LPT{i}" for i in range(1, 10)),
    }
    if basename in windows_reserved:
        raise PathTraversalError(f"Path uses reserved name: {basename}")

    base_resolved = base_directory.resolve()
    target = (base_directory / user_path).resolve()

    if not is_within_directory(target, base_resolved):
        raise PathTraversalError(
            f"Path traversal detected: '{user_path}' escapes base directory"
        )

    # check for symlink escapes
    try:
        real = Path(os.path.realpath(target))
        if not is_within_directory(real, base_resolved):
            raise PathTraversalError(
                f"Symlink escape detected: '{user_path}' resolves outside base"
            )
    except OSError:
        pass  # doesn't exist yet, fine for new files

    return target


def sanitize_filename(filename: str) -> str:
    if not filename:
        return "untitled"

    name = filename.replace("\x00", "")
    name = re.sub(r"[/\\]", "_", name)
    name = name.strip().strip(".")
    name = re.sub(r"\.{2,}", ".", name)
    name = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", name)

    # truncate to 255 bytes for filesystem compat
    encoded = name.encode("utf-8")
    if len(encoded) > 255:
        truncated = encoded[:255]
        try:
            name = truncated.decode("utf-8")
        except UnicodeDecodeError:
            for i in range(3):
                try:
                    name = truncated[: 255 - i].decode("utf-8")
                    break
                except UnicodeDecodeError:
                    continue

    return name if name else "untitled"


def generate_storage_key(original_filename: str, owner_id: str) -> str:
    now = datetime.now(timezone.utc)
    unique = uuid.uuid4().hex
    return f"files/{owner_id}/{now:%Y/%m/%d}/{unique}"


def is_within_directory(path: Path, directory: Path) -> bool:
    try:
        path.resolve().relative_to(directory.resolve())
        return True
    except ValueError:
        return False
