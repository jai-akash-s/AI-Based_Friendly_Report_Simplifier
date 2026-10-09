import sys
import tempfile
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.privacy import delete_report_file


class TestPrivacy(unittest.TestCase):
    def test_deletes_report_file_under_upload_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            upload_dir = Path(temp_dir) / "uploads"
            upload_dir.mkdir()
            report_path = upload_dir / "report.txt"
            report_path.write_text("private report", encoding="utf-8")

            self.assertTrue(delete_report_file(report_path, upload_dir))
            self.assertFalse(report_path.exists())
            self.assertFalse(delete_report_file(report_path, upload_dir))

    def test_refuses_to_delete_file_outside_upload_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "uploads"
            outside = Path(temp_dir) / "private.txt"
            root.mkdir()
            outside.write_text("private report", encoding="utf-8")

            with self.assertRaises(OSError):
                delete_report_file(outside, root)
            self.assertTrue(outside.exists())


if __name__ == "__main__":
    unittest.main()
