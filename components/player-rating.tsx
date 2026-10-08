import { RATING_DESCRIPTION } from "@/lib/player-rating"

// Judged on the displayed (2-decimal) value so the color matches what is shown.
export function ratingTone(rating: number) {
  const shown = Number(rating.toFixed(2))
  if (shown >= 1.19) return "text-green-600 dark:text-green-400"
  if (shown < 0.6) return "text-red-800 dark:text-red-600"
  if (shown <= 0.81) return "text-red-600 dark:text-red-400"
  return ""
}

export function isGoldRating(rating: number) {
  return Number(rating.toFixed(2)) > 1.5
}

export function isDuendeTeam(teamName: string | null | undefined) {
  return /\bduende\b/i.test(teamName ?? "")
}

// Very bad Duende ratings are replaced by an emoji (the number stays in the tooltip).
export function isLaughingRating(
  rating: number,
  teamName: string | null | undefined
) {
  return isDuendeTeam(teamName) && Number(rating.toFixed(2)) <= 0.69
}

export function RatingValue({
  rating,
  reason,
  ratedGames,
  matchesPlayed,
  teamName,
}: {
  rating: number | null | undefined
  reason?: string | null
  ratedGames?: number
  matchesPlayed?: number
  teamName?: string | null
}) {
  if (rating == null) {
    const explanation = reason ?? "No eligible current-version ratings"
    return (
      <span
        title={explanation}
        aria-label={`Unrated: ${explanation}`}
        tabIndex={0}
      >
        —
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 tabular-nums ${ratingTone(rating)}`}
      title={
        isLaughingRating(rating, teamName)
          ? `${rating.toFixed(2)} · ${RATING_DESCRIPTION}`
          : RATING_DESCRIPTION
      }
    >
      <span className={isGoldRating(rating) ? "rating-gold" : undefined}>
        {isLaughingRating(rating, teamName) ? "😂" : rating.toFixed(2)}
      </span>
      {ratedGames !== undefined && matchesPlayed !== undefined ? (
        <span
          className="text-xs text-muted-foreground"
          title={`${ratedGames} of ${matchesPlayed} demos rated`}
          aria-label={`${ratedGames} of ${matchesPlayed} demos rated`}
        >
          {ratedGames}/{matchesPlayed}
        </span>
      ) : null}
    </span>
  )
}

export function RatingExplanation() {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">About SFL Rating v2</summary>
      <p className="mt-2 max-w-2xl">
        {RATING_DESCRIPTION} Averages are weighted by participated rounds;
        coverage shows rated demos / all demos. Unreliable or incomplete
        recordings are unrated. Trades use a three-second teammate window.
        Economy is weighted. This model has not been independently validated
        against HLTV.
      </p>
    </details>
  )
}
