#!/bin/sh
set -e

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/config.json" ]; then
  if [ -f /app/data/config.example.json ]; then
    cp /app/data/config.example.json "$DATA_DIR/config.json"
    echo "Created $DATA_DIR/config.json from example — add tokens via Settings or edit the file."
  fi
fi

exec npx tsx apps/api/src/index.ts
