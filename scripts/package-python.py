"""Write a fresh ZIP with normalized timestamps; never retain stale archive entries."""

from pathlib import Path
import os
import sys
import tempfile
import zipfile

source = Path(sys.argv[1])
output = Path(sys.argv[2])
if source.is_symlink() or not source.is_dir():
    raise ValueError("Package source must be an existing directory")
paths = sorted(source.rglob("*"))
if any(path.is_symlink() for path in paths):
    raise ValueError("Package source cannot contain symlinks")
files = [path for path in paths if path.is_file() and "__pycache__" not in path.parts]
if not files:
    raise ValueError("Refusing an empty package")
descriptor, temporary = tempfile.mkstemp(dir=output.parent, prefix=f".{output.name}.", suffix=".tmp")
os.close(descriptor)
try:
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(source).as_posix(), date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    os.replace(temporary, output)
except BaseException:
    Path(temporary).unlink(missing_ok=True)
    raise
