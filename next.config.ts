import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // @libsql/client ships a native binary for local file mode — keep it out
  // of the RSC bundle, same reasoning as better-sqlite3 before it.
  serverExternalPackages: ["@libsql/client"],
}

export default nextConfig
