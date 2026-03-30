const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
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