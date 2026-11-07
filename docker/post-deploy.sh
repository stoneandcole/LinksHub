#!/bin/sh
# Run inside the container after each deploy (Coolify post-deployment command):
#   sh /app/post-deploy.sh
set -eu
cd /app/apps/web
pnpm exec prisma db push --schema=./prisma/schema --skip-generate
node seed.mjs
