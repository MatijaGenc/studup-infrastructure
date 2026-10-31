import importlib.util
from pathlib import Path
import ssl
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
        pg.connect = MagicMock()
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

    def test_ssl_context_requires_certificate_and_hostname_verification(self):
        context = self.module.build_ssl_context()
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_ssl_context_uses_bundled_rds_ca(self):
        bundle = Path(self.module.__file__).with_name("global-bundle.pem")
        self.assertEqual(self.module.CA_BUNDLE, bundle)
        with patch("ssl.create_default_context") as create_default_context:
            context = self.module.build_ssl_context()
        create_default_context.assert_called_once_with(cafile=str(bundle))
        self.assertIs(context, create_default_context.return_value)

    def test_get_connection_passes_ssl_context_to_pg8000(self):
        sentinel = self.module.build_ssl_context()
        with patch.object(self.module, "build_ssl_context", return_value=sentinel):
            self.module.get_connection("not-a-real-password")
        self.module.pg8000.connect.assert_called_once_with(
            host=self.module.DB_HOST,
            port=self.module.DB_PORT,
            user=self.module.DB_USER,
            password="not-a-real-password",
            database=self.module.DB_NAME,
            ssl_context=sentinel,
        )

    def test_missing_ca_bundle_raises_clear_error(self):
        missing = Path(self.module.__file__).with_name("missing-global-bundle.pem")
        with patch.object(self.module, "CA_BUNDLE", missing):
            with self.assertRaises(FileNotFoundError) as caught:
                self.module.build_ssl_context()
        self.assertIn("RDS CA bundle not found", str(caught.exception))
        self.assertIn(str(missing), str(caught.exception))
