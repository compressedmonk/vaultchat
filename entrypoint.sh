#!/bin/sh
set -e

# One-time move when upgrading from volume-mounted /app/prisma (legacy deploy).
if [ -f /app/data/prod.db ] && [ ! -f /app/data/.db-migrated-from-prisma ]; then
  : # already on new path
elif [ -f /app/prisma/prod.db ] && [ ! -f /app/data/prod.db ]; then
  mkdir -p /app/data
  cp /app/prisma/prod.db /app/data/prod.db
  touch /app/data/.db-migrated-from-prisma
fi

node prisma/apply-patches.js 2>&1
node node_modules/prisma/build/index.js db push --skip-generate 2>&1
exec node server.js
