#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
python3 -m pip install --require-hashes --only-binary=:all: --requirement "$SCRIPT_DIR/requirements.txt" --target "$BUILD_DIR" --no-compile --quiet
cp "$SCRIPT_DIR/rotate.py" "$BUILD_DIR/"
python3 "$SCRIPT_DIR/../scripts/package-python.py" "$BUILD_DIR" "$SCRIPT_DIR/../rotation-function.zip"
