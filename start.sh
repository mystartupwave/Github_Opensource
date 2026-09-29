#!/usr/bin/env bash
# Starts the API (port 8766) and the web app (port 8765). Ctrl+C stops both.
# Run the one-time setup in README.md first.
set -e
root="$(cd "$(dirname "$0")" && pwd)"

(cd "$root/backend" && .venv/bin/python -m uvicorn app.main:app --reload --port 8766) &
api_pid=$!
trap 'kill $api_pid 2>/dev/null' EXIT

echo "API: http://localhost:8766/docs   App: http://localhost:8765"
cd "$root/frontend" && npm run dev
