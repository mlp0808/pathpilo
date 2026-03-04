#!/usr/bin/env bash
# PathPilo – run this on the server after 'git pull' to update the app.
# Usage: ./scripts/deploy.sh   (from repo root on the server)

set -e
cd "$(dirname "$0")/.."

echo "→ Pulling latest..."
git pull origin main

echo "→ Installing root dependencies..."
npm install

echo "→ Building web app..."
npm run build

echo "→ Installing API dependencies..."
cd api-server && npm install && cd ..

echo "→ Building marketing site..."
cd marketing && npm install && npm run build && cd ..

echo "→ Restarting PM2 apps..."
pm2 restart vevago-frontend vevago-api pathpilo-marketing

echo "→ Done. Check: pm2 status"
