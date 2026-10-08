# Build-only. Never run locally — the user's machine has 8 GB RAM.
# Render uses the native Python runtime (see render.yaml); this Dockerfile
# exists for parity and self-hosting on any container host.

FROM node:20-slim AS frontend
WORKDIR /app/src/frontend
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci
COPY src/frontend/ ./
RUN npx tsc -b && npx vite build

FROM node:20-slim AS mastra
WORKDIR /app/src/backend/mastra
COPY src/backend/mastra/package.json src/backend/mastra/package-lock.json ./
RUN npm ci
COPY src/backend/mastra/ ./
RUN npm run build && npm prune --omit=dev

FROM python:3.11-slim AS backend
WORKDIR /app
# Node runtime for the Mastra orchestration harness (absent -> direct path).
RUN apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=frontend /app/src/frontend/dist ./src/frontend/dist
COPY --from=mastra /app/src/backend/mastra/dist ./src/backend/mastra/dist
COPY --from=mastra /app/src/backend/mastra/node_modules ./src/backend/mastra/node_modules
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
EXPOSE 8080
CMD ["uvicorn", "src.backend.api.routes:app", "--host", "0.0.0.0", "--port", "8080"]
