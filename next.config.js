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
  async headers() {
    return [
      {
        source: "/i/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ]
  },
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
