#!/usr/bin/env bash
# Lovert Design — arranca em modo desenvolvimento (Linux/macOS).
# Equivalente ao run.bat do Windows.
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

exec pnpm tauri dev
