# Patched Dub for Stone & Cole on Forge (LinksHub).
# Build context: REPO ROOT (the fork, = dubinc/dub @ 6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e + patches).
#   docker build -f docker/Dockerfile -t linkshub \
#     --build-arg APP_HOST=qr.stoneandcole.com --build-arg SHORT_HOST=go.stoneandcole.com .
# Post-deploy (run in the container): see docker/post-deploy.sh
#   -> prisma db push, then node seed.mjs (idempotent)

ARG NODE_VERSION=22

# ---------- stage 1: copy repo source + apply patches ----------
FROM node:${NODE_VERSION}-bookworm-slim AS source
ARG APP_HOST
ARG SHORT_HOST
WORKDIR /src
COPY . /src
COPY docker/patch.mjs docker/typecheck.mjs /patch/
# patch.mjs throws on any non-single match or upstream drift -> build fails loudly
RUN test -n "$APP_HOST" && test -n "$SHORT_HOST" \
    && APP_HOST="$APP_HOST" SHORT_HOST="$SHORT_HOST" node /patch/patch.mjs

# ---------- stage 2: install + typecheck + build ----------
FROM node:${NODE_VERSION}-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY --from=source /src /app
COPY --from=source /patch /patch
RUN pnpm config set child-concurrency 1 \
    && pnpm install --frozen-lockfile

# NEXT_PUBLIC_* are inlined at build time -> pass as build args.
# Upstream reads only these; add more here if patch/pin changes.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE=""
ARG NEXT_PUBLIC_NGROK_URL=""
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE \
    NEXT_PUBLIC_NGROK_URL=$NEXT_PUBLIC_NGROK_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=6144

# TS stays on: typecheck allowlist (TS_NOISE_JSON, default empty) must pass before build.
ARG TS_NOISE_JSON="[]"
ARG SKIP_TYPECHECK=0
RUN if [ "$SKIP_TYPECHECK" != "1" ]; then TS_NOISE_JSON="$TS_NOISE_JSON" node /patch/typecheck.mjs /app; fi

# Build-time placeholders only so env validation / prisma generate don't fail; real values come at runtime.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build" \
    NEXTAUTH_URL="https://placeholder.invalid" \
    NEXTAUTH_SECRET="build-placeholder"
RUN pnpm config set workspace-concurrency 1 \
    && pnpm --filter web... build

# ---------- stage 3: runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
COPY docker/seed.mjs /app/apps/web/seed.mjs
COPY docker/post-deploy.sh /app/post-deploy.sh
RUN chmod +x /app/post-deploy.sh && chown -R node:node /app
USER node
WORKDIR /app/apps/web
EXPOSE 3000
# /api answers without auth (dub's API root); any HTTP response < 500 counts as up
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api" | grep -qE '^[1-4][0-9][0-9]$' || exit 1
CMD ["sh", "-c", "exec pnpm exec next start -p ${PORT}"]
