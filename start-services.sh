#!/bin/bash
# Start script for Vevago services
# Upload this to ~/httpdocs/app/ and make it executable

cd "$(dirname "$0")"

echo "Starting Vevago services..."

# Start Next.js frontend (port 3000)
echo "Starting Next.js frontend..."
nohup npm start > nextjs.log 2>&1 &

# Start Express backend (port 3002)
echo "Starting Express backend..."
nohup node server.js > server.log 2>&1 &

echo "Services started!"
echo "Check logs:"
echo "  - Frontend: tail -f nextjs.log"
echo "  - Backend: tail -f server.log"
echo ""
echo "Check if running:"
echo "  - Frontend: curl http://localhost:3000"
echo "  - Backend: curl http://localhost:3002"

