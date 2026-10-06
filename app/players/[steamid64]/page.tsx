import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getPlayerBySteamId64,
  getPlayerRosterHistory,
  getPlayerMatchHistory,
} from "@/lib/db"
import { getFaceitPlayerStats } from "@/lib/faceit"
import { getPlayerSummary } from "@/lib/steam-client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

// Same reasoning as app/teams/[name]/page.tsx — DB reads need per-request
// freshness, not Next's build-time fetch caching.
export const dynamic = "force-dynamic"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ steamid64: string }>
}) {
  const { steamid64: steamid64Param } = await params
  const steamid64 = decodeURIComponent(steamid64Param)

  const player = await getPlayerBySteamId64(steamid64)
  if (!player) notFound()

  const [rosterHistory, matchHistory, faceitStats, steamSummary] =
    await Promise.all([
      getPlayerRosterHistory(steamid64),
      getPlayerMatchHistory(steamid64),
      getFaceitPlayerStats(),
      getPlayerSummary(steamid64).catch(() => null),
    ])

  const faceit = faceitStats.get(steamid64)

  return (
    <div className="flex min-h-svh flex-col gap-6 p-6">
      <Link
        href="/leaderboard"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to leaderboard
      </Link>

      <div className="flex items-center gap-4">
        {steamSummary?.avatarUrl ? (
          <img
            src={steamSummary.avatarUrl}
            alt={player.inGameName}
            className="size-16 rounded-md border border-border"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            ?
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium">{player.inGameName}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <a
              href={`https://steamcommunity.com/profiles/${steamid64}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {steamid64}
            </a>
            {faceit ? (
              <>
                <span>·</span>
                <a
                  href={`https://www.faceit.com/en/players/${faceit.faceitNickname}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  {faceit.faceitNickname}
                </a>
                {faceit.elo != null ? (
                  <Badge variant="outline">{faceit.elo} elo</Badge>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 rounded-md border border-border p-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Matches</span>
          <span className="font-medium">{player.matchesPlayed}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Kills</span>
          <span className="font-medium">{player.kills}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Deaths</span>
          <span className="font-medium">{player.deaths}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Assists</span>
          <span className="font-medium">{player.assists}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Avg ADR</span>
          <span className="font-medium">
            {player.adr != null ? player.adr.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">HS%</span>
          <span className="font-medium">
            {player.hsPct != null ? `${(player.hsPct * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">MVPs</span>
          <span className="font-medium">{player.mvps}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Team history
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Season</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Match status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rosterHistory.map((entry) => (
              <TableRow key={entry.rosterEntryId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/teams/${encodeURIComponent(entry.teamName)}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {entry.teamName}
                  </Link>
                </TableCell>
                <TableCell>{entry.season}</TableCell>
                <TableCell>{entry.division}</TableCell>
                <TableCell>{entry.matchStatus}</TableCell>
              </TableRow>
            ))}
            {rosterHistory.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No roster history found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Match history
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Map</TableHead>
              <TableHead className="text-right">K</TableHead>
              <TableHead className="text-right">D</TableHead>
              <TableHead className="text-right">A</TableHead>
              <TableHead className="text-right">ADR</TableHead>
              <TableHead className="text-right">HS%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matchHistory.map((m) => (
              <TableRow key={m.matchId}>
                <TableCell>{formatDate(m.demoDate)}</TableCell>
                <TableCell>{m.mapName ?? "—"}</TableCell>
                <TableCell className="text-right">{m.kills}</TableCell>
                <TableCell className="text-right">{m.deaths}</TableCell>
                <TableCell className="text-right">{m.assists}</TableCell>
                <TableCell className="text-right">
                  {m.adr != null ? m.adr.toFixed(1) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {m.hsPct != null ? `${(m.hsPct * 100).toFixed(1)}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
            {matchHistory.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  No match history found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
