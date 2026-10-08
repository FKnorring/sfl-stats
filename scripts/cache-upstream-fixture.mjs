// Only loaded explicitly by the isolated production-mode cache integration check.
import fs from "node:fs"
import path from "node:path"

const upstream = process.env.CACHE_TEST_UPSTREAM
if (!upstream) throw new Error("CACHE_TEST_UPSTREAM is required")
const overrides = process.env.CACHE_TEST_OVERRIDES_PATH
if (overrides) {
  const originalExists = fs.existsSync
  for (const method of ["existsSync", "readFileSync", "writeFileSync"]) {
    const original = fs[method]
    fs[method] = (file, ...args) => {
      if (
        typeof file === "string" &&
        path.resolve(file) === path.resolve("data/player-overrides.json")
      ) {
        if (method === "writeFileSync" && originalExists(`${overrides}.fail`))
          throw new Error("Fixture override persistence failure")
        return original(overrides, ...args)
      }
      return original(file, ...args)
    }
  }
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (
    ["api.steampowered.com", "widget.toornament.com", "publiclir.se"].includes(
      url.hostname
    )
  ) {
    const destination = new URL("/upstream", upstream)
    destination.searchParams.set("host", url.hostname)
    destination.searchParams.set("path", url.pathname)
    destination.searchParams.set("ids", url.searchParams.get("steamids") ?? "")
    return originalFetch(destination, init)
  }
  return originalFetch(input, init)
}
