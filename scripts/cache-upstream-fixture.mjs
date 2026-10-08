// Only loaded explicitly by the isolated production-mode cache integration check.
const upstream = process.env.CACHE_TEST_UPSTREAM
if (!upstream) throw new Error("CACHE_TEST_UPSTREAM is required")
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
