const MARKER = "RootComponent, "

/**
 * publiclir.se server-renders a React SPA and hydrates it from a JSON blob
 * embedded as `ReactDOM.hydrate(React.createElement(RootComponent, {...}))`
 * inside an inline <script>. Extract that object literal by finding the
 * marker and bracket-matching to its closing brace (quote-aware, so braces
 * inside string values don't throw off the count).
 */
export function extractRootComponentJson(html: string): unknown {
  const start = html.indexOf(MARKER)
  if (start === -1) {
    throw new Error("Could not find RootComponent marker in page HTML")
  }
  const objStart = start + MARKER.length

  let depth = 0
  let inString = false
  let escaped = false
  let end = -1

  for (let i = objStart; i < html.length; i++) {
    const c = html[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (c === "\\") {
        escaped = true
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
    } else if (c === "{") {
      depth++
    } else if (c === "}") {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }

  if (end === -1) {
    throw new Error("Could not find end of RootComponent JSON blob")
  }

  const blob = html.slice(objStart, end)
  return JSON.parse(blob)
}
