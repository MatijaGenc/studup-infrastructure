import contextlib
import email
import importlib.util
import io
import json
import tempfile
import types
import unittest
import zipfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).parents[2]
SPEC = importlib.util.spec_from_file_location("license_gate", ROOT / "scripts/check-python-licenses.py")
licenses = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(licenses)


def message(name, version, expression=None, classifiers=(), license_field=None):
    lines = [f"Name: {name}", f"Version: {version}"]
    if expression is not None:
        lines.append(f"License-Expression: {expression}")
    lines.extend(f"Classifier: {value}" for value in classifiers)
    if license_field is not None:
        lines.append(f"License: {license_field}")
    return email.message_from_string("\n".join(lines) + "\n")


def distribution(name, version, **kwargs):
    return types.SimpleNamespace(metadata=message(name, version, **kwargs))


def archive(path, entries):
    with zipfile.ZipFile(path, "w") as output:
        for name, data in entries.items():
            output.writestr(name, data)


def metadata(name, version, license_header=None):
    lines = [f"Name: {name}", f"Version: {version}"]
    if license_header:
        lines.append(license_header)
    return ("\n".join(lines) + "\n").encode()


def record(name, version, license_text):
    return {"name": name, "version": version, "license": license_text}


def policy(quality_declarations=(), quality_reviews=(), rotation_declarations=(), rotation_reviews=()):
    return {
        "quality": {
            "recordedLicenseDeclarations": list(quality_declarations),
            "existingReviewItems": list(quality_reviews),
        },
        "rotation": {
            "recordedLicenseDeclarations": list(rotation_declarations),
            "existingReviewItems": list(rotation_reviews),
        },
    }


class LicenseInventory(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def test_inventory_is_sorted_complete_and_has_only_public_fields(self):
        path = self.root / "package.zip"
        archive(
            path,
            {
                "zeta-2.0.dist-info/METADATA": metadata("zeta", "2.0", "License-Expression: MIT"),
                "alpha-1.0.dist-info/METADATA": metadata("alpha", "1.0", "License: BSD"),
            },
        )
        observed = licenses.inventory(
            path,
            [
                distribution("zeta", "2.0", expression="MIT"),
                distribution("alpha", "1.0", license_field="BSD"),
                distribution("pip", "25.0", expression="MIT"),
            ],
        )
        self.assertEqual([item["name"] for item in observed["quality"]], ["alpha", "zeta"])
        self.assertEqual([item["name"] for item in observed["rotation"]], ["alpha", "zeta"])
        for scope in ("quality", "rotation"):
            for item in observed[scope]:
                self.assertEqual(set(item), {"name", "version", "license"})

    def test_license_precedence_and_long_license_fallback(self):
        self.assertEqual(
            licenses._declaration(message("a", "1", "MIT", ["License :: OSI Approved :: Apache Software License"], "GPL")),
            record("a", "1", "MIT"),
        )
        classifier = "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)"
        self.assertEqual(licenses._declaration(message("b", "1", None, [classifier])), record("b", "1", classifier))
        self.assertEqual(licenses._declaration(message("c", "1", None, (), "BSD")), record("c", "1", "BSD"))
        self.assertEqual(licenses._declaration(message("d", "1", None, (), "x" * 201)), record("d", "1", "<missing>"))

    def test_unknown_and_missing_declarations_fail(self):
        observed = {
            "quality": [record("known", "1", "MIT"), record("missing", "1", "<missing>")],
            "rotation": [record("rotated", "1", "BSD")],
        }
        errors, warnings = licenses.validate(
            observed,
            policy(quality_declarations=[record("known", "1", "MIT")], rotation_declarations=[record("rotated", "1", "BSD")]),
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("missing 1", errors[0])
        self.assertEqual(warnings, [])
        observed["quality"][0] = record("known", "1", "Apache-2.0")
        errors, _ = licenses.validate(observed, policy(rotation_declarations=[record("rotated", "1", "BSD")]))
        self.assertEqual(len(errors), 2)

    def test_explicit_unresolved_review_allows_missing_and_always_warns(self):
        review = {
            "name": "missing",
            "version": "1",
            "license": "<missing>",
            "status": "unresolved",
            "reason": "license file is ambiguous",
        }
        existing = {
            "name": "known",
            "version": "1",
            "license": "MIT",
            "status": "unresolved",
            "reason": "legal review pending",
        }
        observed = {"quality": [record("missing", "1", "<missing>"), record("known", "1", "MIT")], "rotation": []}
        errors, warnings = licenses.validate(
            observed,
            policy(quality_declarations=[record("known", "1", "MIT")], quality_reviews=[review, existing]),
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 2)
        self.assertTrue(any("license file is ambiguous" in line for line in warnings))
        self.assertTrue(any("legal review pending" in line for line in warnings))
        bad_review = dict(review, status="resolved")
        with self.assertRaises(ValueError):
            licenses.validate(observed, policy(quality_reviews=[bad_review]))

    def test_missing_metadata_cannot_be_recorded_as_a_license_declaration(self):
        unknown = record("missing", "1", "<missing>")
        with self.assertRaises(ValueError):
            licenses.validate({"quality": [unknown], "rotation": []}, policy(quality_declarations=[unknown]))

    def test_known_classifier_variation_passes(self):
        classifier = "License :: OSI Approved :: BSD License"
        observed = {"quality": [], "rotation": [record("pkg", "2", classifier)]}
        errors, warnings = licenses.validate(observed, policy(rotation_declarations=[record("pkg", "2", classifier)]))
        self.assertEqual((errors, warnings), ([], []))

    def test_corrupt_empty_and_metadata_free_archives_fail(self):
        corrupt = self.root / "corrupt.zip"
        corrupt.write_bytes(b"not a zip")
        with self.assertRaises(zipfile.BadZipFile):
            licenses.rotation_records(corrupt)
        empty = self.root / "empty.zip"
        archive(empty, {})
        with self.assertRaises(ValueError):
            licenses.rotation_records(empty)
        no_metadata = self.root / "no-metadata.zip"
        archive(no_metadata, {"pkg-1.dist-info/RECORD": b"pkg"})
        with self.assertRaises(ValueError):
            licenses.rotation_records(no_metadata)

    def test_malformed_and_control_character_metadata_fail(self):
        missing_version = self.root / "missing-version.zip"
        archive(missing_version, {"pkg-1.dist-info/METADATA": b"Name: pkg\n"})
        with self.assertRaises(ValueError):
            licenses.rotation_records(missing_version)
        unsafe = self.root / "unsafe.zip"
        archive(unsafe, {"pkg-1.dist-info/METADATA": b"Name: p\x1bkg\nVersion: 1\n"})
        with self.assertRaises(ValueError):
            licenses.rotation_records(unsafe)

    def test_cli_errors_and_inventory_do_not_disclose_paths(self):
        bad = self.root / "secret-location.zip"
        bad.write_bytes(b"broken")
        stderr = io.StringIO()
        with (
            mock.patch.object(licenses, "ARCHIVE", bad),
            mock.patch.object(
                licenses.importlib.metadata, "distributions", return_value=[distribution("a", "1", expression="MIT")]
            ),
            contextlib.redirect_stderr(stderr),
        ):
            status = licenses.main(["--inventory"])
        self.assertEqual(status, 1)
        self.assertNotIn(str(self.root), stderr.getvalue())
        good = self.root / "good.zip"
        archive(good, {"a-1.dist-info/METADATA": metadata("a", "1", "License-Expression: MIT")})
        stdout = io.StringIO()
        with (
            mock.patch.object(licenses, "ARCHIVE", good),
            mock.patch.object(
                licenses.importlib.metadata, "distributions", return_value=[distribution("a", "1", expression="MIT")]
            ),
            contextlib.redirect_stdout(stdout),
        ):
            status = licenses.main(["--inventory"])
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(stdout.getvalue())["rotation"], [record("a", "1", "MIT")])
        self.assertNotIn(str(self.root), stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
