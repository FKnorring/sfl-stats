const EMBERS = [15, 38, 62, 85]

export function isNetlightTeam(teamName: string | null | undefined) {
  return /\b(boids|duende)\b|netlight/i.test(teamName ?? "")
}

/** Animated flaming player name for Netlight teams (Boids / Duende). */
export function NetlightName({
  children,
  align = "center",
}: {
  children: React.ReactNode
  align?: "center" | "start"
}) {
  return (
    <h1
      className={`flex items-center gap-1.5 text-lg font-semibold ${align === "center" ? "justify-center" : ""}`}
    >
      <span className="netlight-name">{children}</span>
    </h1>
  )
}

/** Rising embers layered over a card; parent must be `relative overflow-hidden`. */
export function NetlightEmbers() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {EMBERS.map((left, i) => (
        <span
          key={left}
          className="netlight-ember"
          style={{
            left: `${left}%`,
            animationDelay: `${(i * 0.37) % 2.4}s`,
            animationDuration: `${1.8 + (i % 3) * 0.6}s`,
          }}
        />
      ))}
    </div>
  )
}
