import tempfile
from pathlib import Path
import pytest

from app.utils.path import (
    safe_path,
    sanitize_filename,
    generate_storage_key,
    is_within_directory,
    PathTraversalError,
)


class TestSafePath:
    def test_normal_path(self, tmp_path: Path):
        result = safe_path("documents/file.txt", tmp_path)
        assert result == (tmp_path / "documents/file.txt").resolve()

    def test_traversal_rejected(self, tmp_path: Path):
        with pytest.raises(PathTraversalError, match="traversal"):
            safe_path("../../../etc/passwd", tmp_path)

    def test_null_bytes_rejected(self, tmp_path: Path):
        with pytest.raises(PathTraversalError, match="null bytes"):
            safe_path("file\x00.txt", tmp_path)

    def test_empty_path_rejected(self, tmp_path: Path):
        with pytest.raises(PathTraversalError, match="empty"):
            safe_path("", tmp_path)

    def test_whitespace_only_rejected(self, tmp_path: Path):
        with pytest.raises(PathTraversalError, match="empty"):
            safe_path("   ", tmp_path)

    def test_dots_only_rejected(self, tmp_path: Path):
        with pytest.raises(PathTraversalError, match="dots"):
            safe_path("...", tmp_path)

    def test_long_path_rejected(self, tmp_path: Path):
        with pytest.raises(PathTraversalError, match="length"):
            safe_path("a" * 5000, tmp_path)


class TestSanitizeFilename:
    def test_normal_name(self):
        assert sanitize_filename("photo.jpg") == "photo.jpg"

    def test_path_separators_replaced(self):
        result = sanitize_filename("../../../etc/passwd")
        assert "/" not in result
        assert "\\" not in result

    def test_null_bytes_stripped(self):
        result = sanitize_filename("file\x00.txt")
        assert "\x00" not in result

    def test_empty_returns_untitled(self):
        assert sanitize_filename("") == "untitled"
        assert sanitize_filename("   ") == "untitled"

    def test_preserves_unicode(self):
        result = sanitize_filename("文档.txt")
        assert "文档" in result

    def test_dots_collapsed(self):
        result = sanitize_filename("file...name.txt")
        assert "..." not in result

    def test_leading_dots_stripped(self):
        result = sanitize_filename("...hidden")
        assert not result.startswith(".")


class TestGenerateStorageKey:
    def test_key_format(self):
        key = generate_storage_key("photo.jpg", "user-123")
        assert key.startswith("files/user-123/")
        assert "photo" not in key

    def test_keys_are_unique(self):
        k1 = generate_storage_key("file.txt", "user-1")
        k2 = generate_storage_key("file.txt", "user-1")
        assert k1 != k2


class TestIsWithinDirectory:
    def test_inside(self, tmp_path: Path):
        child = tmp_path / "sub" / "file.txt"
        assert is_within_directory(child, tmp_path) is True

    def test_outside(self, tmp_path: Path):
        outside = Path("/etc/passwd")
        assert is_within_directory(outside, tmp_path) is False
