#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "==> Instalando dependencias del backend..."
npm install --prefix "$ROOT_DIR/backend" --omit=dev

echo "==> Instalando dependencias del frontend..."
npm install --prefix "$ROOT_DIR/frontend" --omit=dev

if [[ ! -f "$ROOT_DIR/frontend/.env" ]]; then
  echo "ERROR: Falta frontend/.env con VITE_API_URL y VITE_PUBLIC_URL."
  echo "Copia deploy/env/frontend.production.example a frontend/.env y edítalo."
  exit 1
fi

echo "==> Compilando frontend..."
npm run build --prefix "$ROOT_DIR/frontend"

echo "==> Build listo. Frontend en frontend/dist"
