#!/bin/sh
npx prisma db push --skip-generate 2>&1
exec node server.js
