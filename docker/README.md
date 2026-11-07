# LinksHub (patched Dub) build files

Dockerfile + patch/seed/typecheck scripts for the Stone & Cole Dub instance (qr./go.stoneandcole.com).
Upstream pin: dubinc/dub @ 6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e = this fork's base commit. Source is COPYed from the repo; patch.mjs fails the build on any drift.
Build: docker build -f docker/Dockerfile -t linkshub --build-arg APP_HOST=qr.stoneandcole.com --build-arg SHORT_HOST=go.stoneandcole.com .
Post-deploy: sh /app/post-deploy.sh (prisma db push, idempotent seed).
Typecheck allowlist: TS_NOISE_JSON build arg, to be filled from a Docker-host build (SCA-545).

## Runtime secrets

`CRON_SECRET` is required at runtime. Cron endpoints require `Authorization: Bearer $CRON_SECRET` and return an error if it is unset (fail closed).
