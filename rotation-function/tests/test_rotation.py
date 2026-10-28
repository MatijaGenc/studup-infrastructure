import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import MagicMock, patch


class RotationValidation(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        boto = types.ModuleType("boto3")
        boto.client = MagicMock(return_value=self.client)
        pg = types.ModuleType("pg8000")
        native = types.ModuleType("pg8000.native")
        native.literal = MagicMock()
        spec = importlib.util.spec_from_file_location("rotation_under_test", Path(__file__).parents[1] / "rotate.py")
        with patch.dict(sys.modules, {"boto3": boto, "pg8000": pg, "pg8000.native": native}):
            self.module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.module)
        self.event = {"SecretId": "synthetic-secret", "ClientRequestToken": "token", "Step": "testSecret"}

    def test_disabled_rotation_rejects_without_database_access(self):
        self.client.describe_secret.return_value = {"RotationEnabled": False}
        with self.assertRaises(ValueError):
            self.module.lambda_handler(self.event, None)
        self.client.get_secret_value.assert_not_called()

    def test_unknown_token_rejects_without_reading_secret(self):
        self.client.describe_secret.return_value = {"RotationEnabled": True, "VersionIdsToStages": {}}
        with self.assertRaises(ValueError):
            self.module.lambda_handler(self.event, None)
        self.client.get_secret_value.assert_not_called()

    def test_current_token_is_idempotent(self):
        self.client.describe_secret.return_value = {"RotationEnabled": True, "VersionIdsToStages": {"token": ["AWSCURRENT"]}}
        self.module.lambda_handler(self.event, None)
        self.client.get_secret_value.assert_not_called()

    def test_generated_password_has_required_character_classes(self):
        password = self.module.generate_password()
        self.assertEqual(len(password), 32)
        self.assertTrue(any(c.islower() for c in password))
        self.assertTrue(any(c.isupper() for c in password))
        self.assertTrue(any(c.isdigit() for c in password))
