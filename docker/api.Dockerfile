# Shared image for the API (dist/main.js) and the worker (dist/worker.js); compose picks the entrypoint.
# Build context is the repo root:  docker build -f docker/api.Dockerfile .

FROM node:22-slim AS base
# Prisma's query engine needs OpenSSL on Debian slim images.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── deps: full install (dev deps included) from the workspace manifests only, for layer caching ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

# ── build: generate Prisma client and compile. Also the target compose uses for one-shot `prisma migrate deploy` ──
FROM deps AS build
COPY packages/config packages/config
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @dhoblio/api

# ── runtime: production deps only, non-root ──
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
