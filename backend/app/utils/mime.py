from typing import Optional


ALLOWED_MIME_TYPES: dict[str, list[str]] = {
    "image": ["image/jpeg", "image/png", "image/gif", "image/webp"],
    "document": [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/markdown",
        "text/csv",
    ],
    "video": ["video/mp4", "video/webm", "video/quicktime"],
    "audio": ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac"],
    "archive": ["application/zip", "application/gzip", "application/x-tar"],
}

ALL_ALLOWED_MIMES: set[str] = set()
for mimes in ALLOWED_MIME_TYPES.values():
    ALL_ALLOWED_MIMES.update(mimes)

MAX_FILE_SIZE_BYTES: int = 500 * 1024 * 1024  # 500 MB


def detect_mime_type(file_header: bytes, declared_mime: str | None = None) -> str:
    try:
        import magic
        detected = magic.from_buffer(file_header, mime=True)
    except Exception:
        # magic not available, fall back to declared type if it's on the allowlist
        if declared_mime and declared_mime in ALL_ALLOWED_MIMES:
            return declared_mime
        return "application/octet-stream"

    return detected


def is_mime_allowed(mime_type: str) -> bool:
    return mime_type in ALL_ALLOWED_MIMES


def get_mime_category(mime_type: str) -> str | None:
    for category, mimes in ALLOWED_MIME_TYPES.items():
        if mime_type in mimes:
            return category
    return None


def validate_upload(
    file_header: bytes, declared_mime: str | None = None
) -> tuple[str, str | None]:
    detected = detect_mime_type(file_header, declared_mime)

    if not is_mime_allowed(detected):
        return detected, f"File type '{detected}' is not allowed"

    return detected, None
