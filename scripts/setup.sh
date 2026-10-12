#!/usr/bin/env bash
# Installazione completa di LogisticAI (macOS / Linux). Idempotente: si può rilanciare.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31mErrore:\033[0m %s\n' "$1" >&2; exit 1; }

step "1/6 Controllo dei prerequisiti"
command -v node >/dev/null || fail "Node.js non trovato (serve la versione 20 o successiva)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js $NODE_MAJOR trovato, serve la 20 o successiva"
PY=""
for candidate in python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then PY=$candidate; break; fi
done
[ -n "$PY" ] || fail "Python 3.11 o 3.12 non trovato"
echo "Node $(node -v), $($PY --version)"

step "2/6 File .env"
if [ ! -f .env ]; then
  cp .env.example .env
  fail "Ho creato .env da .env.example: inserisci OPENAI_API_KEY, LLM_MODEL, DATA_LLM_MODEL, JWT_SECRET, INTERNAL_SERVICE_SECRET e le password demo, poi rilancia lo script"
fi
grep -Eq '^OPENAI_API_KEY=.+' .env || fail "OPENAI_API_KEY vuota nel file .env"

step "3/6 Dipendenze JavaScript (frontend, backend, tipi condivisi)"
npm install

step "4/6 Ambienti Python (data agent e ChromaDB)"
for svc in data_agent vector_db; do
  [ -d "$svc/.venv" ] || "$PY" -m venv "$svc/.venv"
  "$svc/.venv/bin/pip" install --quiet --upgrade pip
  "$svc/.venv/bin/pip" install --quiet -r "$svc/requirements.txt"
  echo "$svc: ok"
done

step "5/6 Database (migrazioni, utenti demo, listini)"
(cd backend && npx prisma migrate deploy && npm run db:seed)

step "6/6 Indicizzazione della knowledge base in ChromaDB"
vector_db/.venv/bin/chroma run --path vector_db/chroma_data --host 127.0.0.1 --port 8000 > /tmp/logisticai-chroma-setup.log 2>&1 &
CHROMA_PID=$!
trap 'kill $CHROMA_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:8000/api/v2/heartbeat >/dev/null && break; sleep 0.5; done
(cd backend && npm run ingest)

printf '\n\033[32mInstallazione completata.\033[0m Avvia tutto con: scripts/start-all.sh\n'
