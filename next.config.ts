import type { NextConfig } from "next"
import { CACHE_PROFILES } from "./lib/cache-policy"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: CACHE_PROFILES,
  distDir: process.env.CACHE_TEST_BUILD_DIR ?? ".next",
  // @libsql/client ships a native binary for local file mode — keep it out
  // of the RSC bundle, same reasoning as better-sqlite3 before it.
  serverExternalPackages: ["@libsql/client"],
}

export default nextConfig
