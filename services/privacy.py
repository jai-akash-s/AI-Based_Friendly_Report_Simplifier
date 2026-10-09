"""Privacy helpers for deleting report files with ownership-bound storage paths."""

from pathlib import Path


def delete_report_file(file_path, upload_folder):
    """Delete a stored report only when its resolved path is under the upload root."""
    if not file_path:
        return False

    upload_root = Path(upload_folder).resolve()
    report_path = Path(file_path).resolve()
    if upload_root not in report_path.parents:
        raise OSError("Stored report file is outside the configured upload directory.")
    if not report_path.exists():
        return False
    if not report_path.is_file():
        raise OSError("Stored report path is not a regular file.")

    report_path.unlink()
    return True
