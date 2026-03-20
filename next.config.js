/** @type {import("next").NextConfig} */
const path = require("path")
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase.replace(/\/$/, "")}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
