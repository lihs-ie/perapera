# syntax=docker/dockerfile:1.7

# --- Stage 1: deps ---
FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/relay-api/package.json ./packages/relay-api/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @perapera/relay-api...

# --- Stage 2: build ---
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/relay-api/node_modules ./packages/relay-api/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/relay-api ./packages/relay-api
RUN pnpm --filter @perapera/relay-api build

# --- Stage 3: runtime ---
FROM node:24-alpine AS runtime
RUN corepack enable
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy only production deps + compiled output
COPY --from=build /app/packages/relay-api/package.json ./package.json
COPY --from=build /app/packages/relay-api/dist ./dist
COPY --from=build /app/node_modules ./node_modules

USER node
EXPOSE 3001

CMD ["node", "dist/presentation/http/server.js"]
