import { RATING_DESCRIPTION } from "@/lib/player-rating"

export function RatingValue({
  rating,
  reason,
  ratedGames,
  matchesPlayed,
}: {
  rating: number | null | undefined
  reason?: string | null
  ratedGames?: number
  matchesPlayed?: number
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
      className="inline-flex items-baseline gap-1.5 tabular-nums"
      title={RATING_DESCRIPTION}
    >
      {rating.toFixed(2)}
      {ratedGames !== undefined && matchesPlayed !== undefined ? (
        <span
          className="text-[10px] text-muted-foreground"
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
      <summary className="cursor-pointer">About SFL Rating v1</summary>
      <p className="mt-2 max-w-2xl">
        {RATING_DESCRIPTION} Averages are weighted by participated rounds;
        coverage shows rated demos / all demos. Unreliable or incomplete
        recordings are unrated. Trades use a three-second teammate window.
        Economy is not weighted. This model has not been independently validated
        against HLTV.
      </p>
    </details>
  )
}
