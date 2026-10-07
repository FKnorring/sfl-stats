import { parseScheduleWidget, type ScheduledMatch } from "@/lib/toornament-schedule"

const DEFAULT_TOURNAMENT_ID = "2560854090247290879"
const DEFAULT_LOCALE = "en_US"

function getToornamentConfig() {
  return {
    tournamentId: process.env.TOORNAMENT_TOURNAMENT_ID ?? DEFAULT_TOURNAMENT_ID,
    locale: process.env.TOORNAMENT_LOCALE ?? DEFAULT_LOCALE,
  }
}

export async function getToornamentSchedule(): Promise<ScheduledMatch[]> {
  const { tournamentId, locale } = getToornamentConfig()
  const url = `https://widget.toornament.com/tournaments/${tournamentId}/matches/schedule/?_locale=${locale}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to fetch Toornament schedule: ${res.status}`)
  }
  return parseScheduleWidget(await res.text())
}
