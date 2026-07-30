#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

pip3 install pg8000 boto3 --target "$BUILD_DIR" --quiet 2>&1 | tail -1

cp "$SCRIPT_DIR/rotate.py" "$BUILD_DIR/"

OUTPUT_ZIP="$SCRIPT_DIR/../rotation-function.zip"
cd "$BUILD_DIR"
zip -r9 "$OUTPUT_ZIP" . --quiet
cd "$SCRIPT_DIR"

rm -rf "$BUILD_DIR"

echo "Created rotation-function.zip ($(wc -c < "$OUTPUT_ZIP") bytes)"