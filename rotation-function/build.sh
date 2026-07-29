#!/bin/bash
set -e

BUILD_DIR="$(dirname "$0")/build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

pip3 install pg8000 boto3 --target "$BUILD_DIR" --quiet 2>&1 | tail -1

cp "$(dirname "$0")/rotate.py" "$BUILD_DIR/"

cd "$BUILD_DIR"
zip -r9 ../rotation-function.zip . --quiet
cd ..

rm -rf "$BUILD_DIR"

echo "Created rotation-function.zip ($(wc -c < rotation-function.zip) bytes)"