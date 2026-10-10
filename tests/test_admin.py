# pyright: reportCallIssue=false

import os
import sys
import tempfile
import unittest

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app import app
from database.models import db, User, Patient, MedicalReport


class TestAdminRoutesAndRoles(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        app.config["UPLOAD_FOLDER"] = self.temp_dir.name
        app.config["CSRF_ENABLED"] = False
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_akash_automatically_gets_admin_role(self):
        """Verify that akash.saravanan1797@gmail.com is created with role='admin'."""
        self.client.post(
            "/register",
            data={
                "email": "akash.saravanan1797@gmail.com",
                "password": "Password123!",
                "password_confirmation": "Password123!",
            },
        )
        user = User.query.filter_by(email="akash.saravanan1797@gmail.com").first()
        self.assertIsNotNone(user)
        assert user is not None
        self.assertEqual(user.role, "admin")

        session_res = self.client.get("/api/auth/session")
        self.assertEqual(session_res.status_code, 200)
        data = session_res.get_json()
        self.assertTrue(data.get("is_admin"))
        self.assertEqual(data.get("role"), "admin")

    def test_regular_user_gets_user_role_and_cannot_access_admin(self):
        """Verify regular users receive role='user' and are denied from /api/admin/*."""
        self.client.post(
            "/register",
            data={
                "email": "regular.user@example.com",
                "password": "Password123!",
                "password_confirmation": "Password123!",
            },
        )
        user = User.query.filter_by(email="regular.user@example.com").first()
        self.assertIsNotNone(user)
        assert user is not None
        self.assertEqual(user.role, "user")

        session_res = self.client.get("/api/auth/session")
        data = session_res.get_json()
        self.assertFalse(data.get("is_admin"))

        # Accessing admin overview returns 403 Forbidden
        admin_res = self.client.get("/api/admin/overview")
        self.assertEqual(admin_res.status_code, 403)

    def test_admin_can_view_users_and_overview(self):
        """Verify admin can view overview and user list."""
        self.client.post(
            "/register",
            data={
                "email": "akash.saravanan1797@gmail.com",
                "password": "Password123!",
                "password_confirmation": "Password123!",
            },
        )
        overview_res = self.client.get("/api/admin/overview")
        self.assertEqual(overview_res.status_code, 200)
        data = overview_res.get_json()
        self.assertIn("total_users", data)
        self.assertIn("system_status", data)

        users_res = self.client.get("/api/admin/users")
        self.assertEqual(users_res.status_code, 200)
        users = users_res.get_json()
        self.assertGreaterEqual(len(users), 1)


if __name__ == "__main__":
    unittest.main()
