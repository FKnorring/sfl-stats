import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // better-sqlite3 ships a native binary — keep it out of the RSC bundle.
  serverExternalPackages: ["better-sqlite3"],
}

export default nextConfig
