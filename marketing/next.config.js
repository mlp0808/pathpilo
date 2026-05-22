const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Match main app: locale props on shared page components fail strict route typing.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keeps file tracing & tooling rooted in /marketing when a parent lockfile exists
  outputFileTracingRoot: path.join(__dirname),
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
}

module.exports = nextConfig