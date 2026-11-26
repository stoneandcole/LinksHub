# Dub (patched) build files

Dockerfile, patch, seed and typecheck scripts for self-hosting Dub with Coolify.

## What gets built

This is the **upstream-patch approach**. The Dockerfile does **not** build the source in this repository. It clones `https://github.com/dubinc/dub.git` at the pinned commit `6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e` (the build fails if `HEAD` differs), applies `patch.mjs`, then builds.

Changes to `apps/` or `packages/` in this repository therefore have **no effect** on the image. Change the patches or the pin instead.

## Coolify settings

- Build pack: `Dockerfile`
- Base directory (build context): `/deploy/dub`
- Dockerfile location (relative to the base directory): `/Dockerfile`
- Exposed port: `3000`
- Healthcheck: `GET /api` on port `3000`. The Dockerfile `HEALTHCHECK` already does this and treats any status below 500 as healthy.
- Post-deployment command: `sh /app/post-deploy.sh`
- Build host: the Node heap limit is 6144 MB, so give the build more memory than that. The build also needs network access to GitHub and the npm registry.

## Build arguments

Required (the build fails without them):

- `APP_HOST`: hostname of the dashboard and API, without a scheme
- `SHORT_HOST`: hostname of the short links, without a scheme

Optional:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE`
- `NEXT_PUBLIC_NGROK_URL`
- `TS_NOISE_JSON`: typecheck allowlist, a JSON array of `{"file": "<regex>", "code": "TSxxxx"}`. Defaults to empty.
- `SKIP_TYPECHECK`: `1` skips the `typecheck.mjs` step. Do not set it for production.
- `DUB_REPO`, `DUB_COMMIT`: override the pinned source. Leave unset.

Do not mark runtime secrets as build variables in Coolify.

## Runtime environment variables

Core:

- `DATABASE_URL`
- `PLANETSCALE_DATABASE_URL`
- `NEXTAUTH_URL` (the `https://` URL of `APP_HOST`)
- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY` (32 bytes, base64)
- `CRON_SECRET`

Redis (Upstash REST API, not the plain Redis protocol):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `UPSTASH_GLOBAL_REDIS_REST_URL` (optional)
- `UPSTASH_GLOBAL_REDIS_REST_TOKEN` (optional)

Queues and background jobs (QStash):

- `QSTASH_URL`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

Email (SMTP or Resend):

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- `RESEND_API_KEY`

File storage (S3-compatible, for uploaded images):

- `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_ENDPOINT`, `STORAGE_BASE_URL`
- `STORAGE_PUBLIC_BUCKET`, `STORAGE_PRIVATE_BUCKET`

Analytics (optional; without `TINYBIRD_API_KEY`, click events are not sent to Tinybird):

- `TINYBIRD_API_KEY`
- `TINYBIRD_API_URL`

First-run seed (read by `seed.mjs`):

- `DUB_ADMIN_EMAIL`, `DUB_ADMIN_PASSWORD`: the seed is skipped unless both are set. The password is used only when the admin user is first created, or when a reset is requested
- `RESET_ADMIN_PASSWORD` (optional): set to `true` to reset an existing admin's password to `DUB_ADMIN_PASSWORD`. It applies on every deploy while set, so remove it after the reset
- `DUB_ADMIN_NAME`
- `DUB_WORKSPACE_SLUG`, `DUB_WORKSPACE_NAME`
- `DUB_SHORT_DOMAIN`

For other optional integrations, see `apps/web/.env.example`.

## Database

- MySQL (upstream uses `mysql:8.0` for local development). `DATABASE_URL` is a `mysql://` URL.
- Parts of the app, including link redirects, use the PlanetScale HTTP driver. `PLANETSCALE_DATABASE_URL` must point to PlanetScale or to a compatible HTTP proxy in front of MySQL. Upstream uses `ps-http-sim` for this in `apps/web/docker-compose.yml`, which is intended for local development only.
- `post-deploy.sh` runs `prisma db push` on every deploy. Take a database backup before changing `DUB_COMMIT`.

## Post-deploy behaviour

`sh /app/post-deploy.sh` runs `prisma db push`, then `seed.mjs`. The seed sets the admin password to `DUB_ADMIN_PASSWORD` when it creates the admin user. An existing admin keeps their password on redeploy, unless `RESET_ADMIN_PASSWORD` is `true`. On **every** deploy, the seed still clears any account lock and rewrites the workspace limits.

## Request authentication

Outside local development, cron `GET` requests require `Authorization: Bearer $CRON_SECRET`, and QStash `POST` requests require a valid `Upstash-Signature`. Both fail closed when the corresponding keys are unset.

## Manual build

```sh
docker build -t sc-dub \
  --build-arg APP_HOST=app.example.com \
  --build-arg SHORT_HOST=s.example.com \
  deploy/dub
```

## Not verified

No Docker build of these files has been run from this repository.
