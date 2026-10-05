import type { TeamMapStat } from "@/lib/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function TeamMapStats({ maps }: { maps: TeamMapStat[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Maps played
      </h2>
      {maps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingested demos for this team yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Map</TableHead>
              <TableHead className="text-right">Matches</TableHead>
              <TableHead className="text-right">Win%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {maps.map((m) => (
              <TableRow key={m.mapName}>
                <TableCell className="font-medium">{m.mapName}</TableCell>
                <TableCell className="text-right">{m.matchesPlayed}</TableCell>
                <TableCell className="text-right">
                  {m.winRate != null
                    ? `${m.wins}-${m.losses} (${Math.round(m.winRate * 100)}%)`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">
        More scouting data — win rates, recent form — coming soon.
      </p>
    </div>
  )
}
