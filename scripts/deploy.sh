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

echo "→ Writing marketing/.env (Hotjar vars for build)..."
grep -E '^NEXT_PUBLIC_HOTJAR_' .env > marketing/.env 2>/dev/null || true

echo "→ Building marketing site..."
cd marketing && npm install && npm run build && cd ..

echo "→ Installing blog MCP connector (Grok)..."
cd marketing/mcp-blog && npm install && cd ../..

echo "→ Restarting PM2 apps (do not reset frontend/api ports from ecosystem)..."
pm2 restart pathpilo-frontend 2>/dev/null || true
pm2 restart pathpilo-api 2>/dev/null || true
pm2 restart pathpilo-marketing 2>/dev/null || true
pm2 delete pathpilo-blog-mcp 2>/dev/null || true
pm2 start ecosystem.config.js --only pathpilo-blog-mcp
pm2 save

echo "→ Done. Check: pm2 status"
echo "  Blog connector: https://pathpilo.com/blog-mcp/health"
