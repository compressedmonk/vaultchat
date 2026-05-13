#!/bin/sh
node node_modules/prisma/build/index.js db push --skip-generate 2>&1
exec node server.js
