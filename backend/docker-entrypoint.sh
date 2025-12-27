#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

echo "Running Prisma migrations..."
./node_modules/.bin/prisma migrate deploy --schema ./backend/prisma/schema.prisma

echo "Starting backend..."
exec node ./backend/dist/index.js


