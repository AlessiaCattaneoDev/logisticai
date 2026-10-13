# Backend (orchestratore) per Railway. Contesto di build: la root del repository.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/types shared/types
COPY frontend/package.json frontend/package.json
COPY backend backend
RUN npm ci --workspace @logisticai/backend --workspace @logisticai/shared
COPY knowledge_base/source knowledge_base/source
WORKDIR /app/backend
ENV NODE_ENV=production
# Migrazioni e utenti (idempotente), poi il server: con AUTO_INGEST indicizza la libreria se Chroma è vuoto.
CMD ["npm", "run", "start:prod"]
