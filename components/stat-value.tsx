import { cn } from "@/lib/utils"

/**
 * Faceit-style stat coloring: green when meaningfully above the league
 * average, red when meaningfully below. `invert` is for stats where lower
 * is better (deaths) so the color still means "good"/"bad", not "high"/"low".
 * The 5% deadzone avoids flagging noise around the average as good or bad.
 */
function compareToAverage(
  value: number,
  average: number,
  invert: boolean
): "good" | "bad" | "neutral" {
  if (average === 0) return "neutral"
  const diff = (value - average) / average
  const threshold = 0.05
  if (Math.abs(diff) < threshold) return "neutral"
  const isAbove = diff > 0
  const isGood = invert ? !isAbove : isAbove
  return isGood ? "good" : "bad"
}

export function StatValue({
  value,
  average,
  invert = false,
  format,
  className,
}: {
  value: number | null
  average?: number | null
  invert?: boolean
  format?: (value: number) => string
  className?: string
}) {
  if (value == null) return <span className={className}>—</span>

  const comparison =
    average != null ? compareToAverage(value, average, invert) : "neutral"

  return (
    <span
      className={cn(
        comparison === "good" && "text-emerald-600",
        comparison === "bad" && "text-destructive",
        className
      )}
    >
      {format ? format(value) : value}
    </span>
  )
}
