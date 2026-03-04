/** @type {import('next').NextConfig} */
const path = require('path')
const nextConfig = {
  // Use project root for file tracing (avoids warning when marketing has its own lockfile)
  outputFileTracingRoot: path.join(__dirname),
  // Proxy /api to the api-server so API requests reach the backend
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase.replace(/\/$/, '')}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
