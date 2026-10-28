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
