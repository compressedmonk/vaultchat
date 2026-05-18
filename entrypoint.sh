#!/bin/sh
set -e
node prisma/apply-patches.js 2>&1
node node_modules/prisma/build/index.js db push --skip-generate 2>&1
exec node server.js
