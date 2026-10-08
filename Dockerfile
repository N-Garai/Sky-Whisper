# Production image. Render builds this Dockerfile directly; the same file
# serves for self-hosting on any container host. Never run the build
# locally — the dev machine has 8 GB RAM.

FROM node:20-slim AS frontend
WORKDIR /app/src/frontend
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci
COPY src/frontend/ ./
RUN npx tsc -b && npx vite build

# @mastra/core requires Node >= 22.13 — the 20-slim image used for the
# lightweight frontend build is not enough here.
FROM node:22-slim AS mastra
WORKDIR /app/src/backend/mastra
COPY src/backend/mastra/package.json src/backend/mastra/package-lock.json ./
RUN npm ci
COPY src/backend/mastra/ ./
RUN npm run build && npm prune --omit=dev

FROM python:3.11-slim AS backend
WORKDIR /app
# Node 22 runtime for the Mastra orchestration harness (same major as the
# build stage; Debian's stock nodejs is v20 and would trip Mastra's engine
# check at runtime). Absent/broken node degrades to the direct model path.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
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
# $PORT is injected by the host (Render sets it); default keeps docker run simple.
CMD ["sh", "-c", "uvicorn src.backend.api.routes:app --host 0.0.0.0 --port ${PORT:-8080}"]
