from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).parents[2]


class Packaging(unittest.TestCase):
    def test_zip_is_fresh_and_normalizes_timestamps(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            (source / "rotate.py").write_text("pass\n")
            output = root / "package.zip"
            with zipfile.ZipFile(output, "w") as archive:
                archive.writestr("stale.py", "stale")
            subprocess.run(["python3", str(ROOT / "scripts/package-python.py"), str(source), str(output)], check=True)
            first = output.read_bytes()
            os.utime(source / "rotate.py", (100000, 100000))
            subprocess.run(["python3", str(ROOT / "scripts/package-python.py"), str(source), str(output)], check=True)
            self.assertEqual(first, output.read_bytes())
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.namelist(), ["rotate.py"])

    def test_migration_placeholder_package_is_fresh_and_deterministic(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "migration-runner-placeholder.zip"
            with zipfile.ZipFile(output, "w") as archive:
                archive.writestr("stale.mjs", "stale")
            subprocess.run(
                ["python3", str(ROOT / "scripts/package-python.py"), str(ROOT / "migration-runner"), str(output)],
                check=True,
            )
            first = output.read_bytes()
            subprocess.run(
                ["python3", str(ROOT / "scripts/package-python.py"), str(ROOT / "migration-runner"), str(output)],
                check=True,
            )
            self.assertEqual(first, output.read_bytes())
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(archive.namelist(), ["global-bundle.pem", "run.mjs"])
                self.assertIn(b"export const handler", archive.read("run.mjs"))
                self.assertTrue(archive.read("global-bundle.pem").startswith(b"-----BEGIN CERTIFICATE-----"))

    def test_packaging_failure_preserves_the_previous_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            blocked = source / "blocked.py"
            blocked.write_text("blocked\n")
            output = root / "package.zip"
            output.write_bytes(b"previous")
            blocked.chmod(0)
            try:
                result = subprocess.run(
                    ["python3", str(ROOT / "scripts/package-python.py"), str(source), str(output)],
                    capture_output=True,
                )
            finally:
                blocked.chmod(0o644)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_bytes(), b"previous")

    def test_missing_empty_or_symlink_sources_preserve_previous_archive(self):
        for case in ("missing", "empty", "symlink"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source = root / "source"
                output = root / "package.zip"
                output.write_bytes(b"previous")
                if case != "missing":
                    source.mkdir()
                if case == "symlink":
                    outside = root / "outside.txt"
                    outside.write_text("must not package")
                    (source / "escape.txt").symlink_to(outside)
                result = subprocess.run(
                    ["python3", str(ROOT / "scripts/package-python.py"), str(source), str(output)],
                    capture_output=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output.read_bytes(), b"previous")
                self.assertEqual(list(root.glob(".*.tmp")), [])

    def test_dependency_install_failure_cannot_report_a_successful_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            function = root / "rotation-function"
            function.mkdir()
            shutil.copyfile(ROOT / "rotation-function/build.sh", function / "build.sh")
            binary = root / "python3"
            binary.write_text("#!/bin/sh\nexit 23\n")
            binary.chmod(0o755)
            result = subprocess.run(
                ["bash", str(function / "build.sh")],
                env={**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"]},
                capture_output=True,
            )
            self.assertEqual(result.returncode, 23)
            self.assertFalse((root / "rotation-function.zip").exists())
