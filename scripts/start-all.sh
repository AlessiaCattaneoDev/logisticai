#!/usr/bin/env bash
# Avvia i 4 microservizi di LogisticAI, ognuno nel proprio processo. Ctrl+C li ferma tutti.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
PIDS=()

start() {
  local name=$1; shift
  ("$@" > "logs/$name.log" 2>&1) &
  PIDS+=($!)
  echo "  $name avviato (log: logs/$name.log)"
}

wait_for() {
  local name=$1 url=$2
  for _ in $(seq 1 120); do curl -sf "$url" >/dev/null && { echo "  $name pronto"; return; }; sleep 0.5; done
  echo "  $name non risponde: controlla logs/$name.log" >&2; exit 1
}

cleanup() { echo; echo "Arresto dei servizi..."; kill "${PIDS[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "0. Database PostgreSQL"
# Postgres locale (prisma dev, senza Docker) solo se il .env punta a localhost:51214; con Neon non serve.
local_db() { grep -Eq '^DATABASE_URL=.*localhost:51214' .env && (cd backend && npm run --silent db:local >/dev/null) || true; }
local_db
echo "  database pronto"

echo "1. ChromaDB (vector store, porta 8000)"
start chroma vector_db/.venv/bin/chroma run --path vector_db/chroma_data --host 127.0.0.1 --port 8000
wait_for chroma http://127.0.0.1:8000/api/v2/heartbeat

echo "2. Data agent Python (porta 8001)"
start data_agent bash -c 'cd data_agent && exec .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001'
wait_for data_agent http://127.0.0.1:8001/health

echo "3. Backend Node.js (porta 3001)"
start backend bash -c 'cd backend && exec ../node_modules/.bin/tsx src/server.ts'
wait_for backend http://localhost:3001/api/health

echo "4. Frontend React (porta 5173)"
start frontend bash -c 'cd frontend && exec ../node_modules/.bin/vite --port 5173 --strictPort'
wait_for frontend http://localhost:5173

printf '\n\033[32mLogisticAI è pronto:\033[0m http://localhost:5173  (Ctrl+C per fermare tutto)\n'
wait
