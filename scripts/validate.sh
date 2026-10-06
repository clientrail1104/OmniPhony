#!/usr/bin/env bash
set -euo pipefail
python3 -m unittest discover -s tests -v
node --test tests/rating.test.mjs
node --check apps/api/src/server.mjs
node --check apps/api/src/wallet.mjs
npm run build
DATABASE_URL="${DATABASE_URL:-postgresql://validation:validation@localhost/validation}" npx prisma validate --schema db/schema.prisma
