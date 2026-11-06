"""Fail when Python license declarations drift from the recorded policy.

Quality coverage is deliberately broad: every distribution in the active
quality environment is inventoried except pip, setuptools and wheel. This
captures transitive tooling without a fragile Requires-Dist parser. Rotation
coverage uses top-level ``*.dist-info/METADATA`` entries in the deployment
archive; archive code is never imported or executed.
"""

import argparse
import email.parser
import email.policy
import importlib.metadata
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "rotation-function.zip"
POLICY = Path(__file__).resolve().with_name("python-license-observations.json")
EXCLUDED = frozenset({"pip", "setuptools", "wheel"})
MISSING = "<missing>"
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
_DIST_INFO = re.compile(r"^([^/]+\.dist-info)/")
_DIST_METADATA = re.compile(r"^[^/]+\.dist-info/METADATA$")


def _safe(value):
    if not isinstance(value, str) or _CONTROL.search(value):
        raise ValueError("invalid metadata")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError as error:
        raise ValueError("invalid metadata") from error
    value = " ".join(value.split())
    if not value:
        raise ValueError("empty metadata")
    return value


def _values(message, key):
    getter = getattr(message, "get_all", None)
    values = getter(key) if getter else None
    if values is None:
        value = message.get(key) if hasattr(message, "get") else None
        values = [] if value is None else [value]
    return [value for value in values if value is not None]


def _value(message, key):
    values = _values(message, key)
    return values[0] if values else None


def _declaration(message):
    name, version = _value(message, "Name"), _value(message, "Version")
    if name is None or version is None:
        raise ValueError("malformed metadata")
    name, version = _safe(name), _safe(version)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.!+_-]*", version):
        raise ValueError("invalid package identity")
    expression = _value(message, "License-Expression")
    if expression is not None and expression.strip():
        license_text = _safe(expression)
    else:
        classifiers = [cleaned for value in _values(message, "Classifier") if (cleaned := _safe(value)).startswith("License ::")]
        if classifiers:
            license_text = " | ".join(sorted(set(classifiers)))
        else:
            field = _value(message, "License")
            if field is not None and field.strip():
                field = _safe(field)
                license_text = field if len(field) <= 200 else MISSING
            else:
                license_text = MISSING
    return {"name": name, "version": version, "license": license_text}


def _sort(records):
    return sorted(records, key=lambda item: (item["name"].lower(), item["version"], item["license"]))


def quality_records(distributions=None):
    records = []
    for distribution in importlib.metadata.distributions() if distributions is None else distributions:
        record = _declaration(distribution.metadata)
        if record["name"].lower().replace("_", "-") not in EXCLUDED:
            records.append(record)
    if not records:
        raise ValueError("no quality packages")
    return _sort(records)


def rotation_records(path=None):
    with zipfile.ZipFile(ARCHIVE if path is None else path) as archive:
        names = archive.namelist()
        directories = {match.group(1) for name in names if (match := _DIST_INFO.match(name))}
        metadata = sorted(name for name in names if _DIST_METADATA.fullmatch(name))
        if not metadata or any(f"{directory}/METADATA" not in names for directory in directories):
            raise ValueError("missing metadata")
        records = []
        for name in metadata:
            try:
                message = email.parser.BytesParser(policy=email.policy.compat32).parsebytes(archive.read(name))
            except Exception as error:
                raise ValueError("malformed metadata") from error
            records.append(_declaration(message))
    return _sort(records)


def inventory(rotation_path=None, distributions=None):
    return {"quality": quality_records(distributions), "rotation": rotation_records(rotation_path)}


def _key(item):
    if not isinstance(item, dict):
        raise ValueError("invalid policy")
    return (_safe(item.get("name")), _safe(item.get("version")), _safe(item.get("license")))


def _section(policy, scope):
    section = policy.get(scope) if isinstance(policy, dict) else None
    if not isinstance(section, dict):
        raise ValueError("invalid policy")
    declarations, reviews = section.get("recordedLicenseDeclarations"), section.get("existingReviewItems")
    if not isinstance(declarations, list) or not isinstance(reviews, list):
        raise ValueError("invalid policy")
    return declarations, reviews


def validate(observed, policy):
    errors, warnings = [], []
    if not isinstance(observed, dict):
        raise ValueError("invalid inventory")
    for scope in ("quality", "rotation"):
        records = observed.get(scope)
        if not isinstance(records, list):
            raise ValueError("invalid inventory")
        declarations, reviews = _section(policy, scope)
        declared = {_key(item) for item in declarations}
        if len(declared) != len(declarations) or any(
            key[2].upper() in {MISSING.upper(), "UNKNOWN", "UNLICENSED", "NONE", "NOASSERTION"}
            or key[2].upper().startswith("SEE LICENSE IN")
            for key in declared
        ):
            raise ValueError("invalid recorded declaration")
        reviewed = {}
        for item in reviews:
            key = _key(item)
            if item.get("status") != "unresolved":
                raise ValueError("invalid policy")
            reviewed[key] = _safe(item.get("reason"))
            warnings.append(f"{scope}: unresolved license review for {key[0]} {key[1]}: {reviewed[key]}")
        for record in records:
            key = _key(record)
            if key in declared or key in reviewed:
                continue
            if key[2] == MISSING:
                errors.append(f"{scope}: {key[0]} {key[1]} has no usable license declaration")
            else:
                errors.append(f"{scope}: {key[0]} {key[1]} declares an unrecorded license")
    return errors, warnings


def main(argv=None):
    parser = argparse.ArgumentParser(prog="check-python-licenses", description="Validate Python dependency license declarations.")
    parser.add_argument("--inventory", action="store_true", help="print the current inventory without validating")
    arguments = parser.parse_args(argv)
    try:
        observed = inventory()
    except Exception:
        print("license inventory failed: cannot read dependency metadata", file=sys.stderr)
        return 1
    if arguments.inventory:
        print(json.dumps(observed, indent=2, sort_keys=True))
        return 0
    try:
        errors, warnings = validate(observed, json.loads(POLICY.read_text(encoding="utf-8")))
    except Exception:
        print("license inventory failed: invalid or missing policy", file=sys.stderr)
        return 1
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        print(f"license inventory failed: {len(errors)} unresolved declaration(s)", file=sys.stderr)
        return 1
    print("license inventory is current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
