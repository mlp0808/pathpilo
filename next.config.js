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
      // Proxy company logos (and any other user-uploaded asset under /uploads/)
      // through to the API server. Lets us reference them with a relative URL
      // from anywhere in the frontend, including the public invoice page.
      {
        source: "/uploads/:path*",
        destination: `${apiBase.replace(/\/$/, "")}/uploads/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
