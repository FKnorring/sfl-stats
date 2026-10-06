import Link from "next/link"
import type { TeamRosterPlayerRow } from "@/lib/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { RosterAccountEditor } from "@/components/roster-account-editor"

type FaceitLookup = Map<string, { faceitNickname: string; elo: number | null }>

/**
 * Single-team roster table: same demo-derived stat columns as
 * app/teams/compare/page.tsx's RosterTable, plus an Accounts column for
 * viewing/correcting the steamID match and viewing (read-only) the Faceit
 * link. Kept separate from the compare page's table rather than shared,
 * since that one has no Accounts column and no reason to grow one.
 */
export function TeamRosterTable({
  teamName,
  roster,
  faceitStats,
}: {
  teamName: string
  roster: TeamRosterPlayerRow[]
  faceitStats: FaceitLookup
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Matches</TableHead>
          <TableHead className="text-right">K</TableHead>
          <TableHead className="text-right">D</TableHead>
          <TableHead className="text-right">A</TableHead>
          <TableHead className="text-right">ADR</TableHead>
          <TableHead className="text-right">HS%</TableHead>
          <TableHead className="text-right">Faceit Elo</TableHead>
          <TableHead>Accounts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roster.map((row) => {
          const faceit = row.steamid64 ? faceitStats.get(row.steamid64) : undefined
          return (
            <TableRow key={row.rosterEntryId}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {row.steamid64 ? (
                    <Link
                      href={`/players/${encodeURIComponent(row.steamid64)}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.inGameName ?? row.nickname}
                    </Link>
                  ) : (
                    row.inGameName ?? row.nickname
                  )}
                  {row.matchStatus !== "manual" &&
                  row.matchStatus !== "auto_high" ? (
                    <Badge variant="outline" className="text-amber-600">
                      {row.matchStatus === "auto_low"
                        ? "low-confidence match"
                        : row.matchStatus === "unmatched"
                          ? "unmatched"
                          : row.matchStatus}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">{row.matchesPlayed}</TableCell>
              <TableCell className="text-right">{row.kills}</TableCell>
              <TableCell className="text-right">{row.deaths}</TableCell>
              <TableCell className="text-right">{row.assists}</TableCell>
              <TableCell className="text-right">
                {row.adr != null ? row.adr.toFixed(1) : "—"}
              </TableCell>
              <TableCell className="text-right">
                {row.hsPct != null ? `${(row.hsPct * 100).toFixed(1)}%` : "—"}
              </TableCell>
              <TableCell className="text-right">
                {faceit?.elo ?? "—"}
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Steam:</span>
                    {row.steamid64 ? (
                      <a
                        href={`https://steamcommunity.com/profiles/${row.steamid64}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-4 hover:underline"
                      >
                        {row.steamid64}
                      </a>
                    ) : (
                      <span>—</span>
                    )}
                    <RosterAccountEditor
                      teamName={teamName}
                      rosterEntryId={row.rosterEntryId}
                      currentSteamid64={row.steamid64}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Faceit:</span>
                    {faceit ? (
                      <a
                        href={`https://www.faceit.com/en/players/${faceit.faceitNickname}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-4 hover:underline"
                      >
                        {faceit.faceitNickname}
                      </a>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
        {roster.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground">
              No roster entries for this team.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}
