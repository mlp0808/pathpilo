const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the shared route-planner package (plain TS/TSX) consumed from ../packages.
  transpilePackages: ['@pathpilo/route-planner-core'],
  // Match main app: locale props on shared page components fail strict route typing.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Root tracing at the repo root so the standalone build includes the shared
  // package that lives in ../packages/route-planner-core.
  outputFileTracingRoot: path.join(__dirname, '..'),
  output: 'standalone', // For easier deployment
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  // MCP uploads land in public/images/articles after build. beforeFiles rewrite
  // serves them from disk via /api/blog-media (no rebuild required).
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/images/articles/:path*',
          destination: '/api/blog-media/:path*',
        },
      ],
    }
  },
}

module.exports = nextConfig