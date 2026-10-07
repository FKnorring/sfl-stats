import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { getAdminRosterEntries } from "@/lib/db"
import { isLocalEnv } from "@/lib/env"
import { SteamIdEditor } from "./steamid-editor"

export const dynamic = "force-dynamic"

// Local-only maintenance tool (ADR-0002): 404s unless ENV=local.
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  if (!isLocalEnv) notFound()

  const { q = "" } = await searchParams
  const entries = await getAdminRosterEntries(q)

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Admin</h1>
      <p className="text-sm text-muted-foreground">
        Overwrite a roster entry&apos;s Steam64 ID. Manual values are saved to
        the database and data/player-overrides.json, so future ingests keep
        them.
      </p>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search nickname, name, team or Steam64"
          className="h-8 w-80 rounded-md border border-input bg-transparent px-2 text-sm"
        />
        <button className="h-8 rounded-md border border-input px-3 text-sm">
          Search
        </button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Nickname</th>
            <th>Real name</th>
            <th>Team</th>
            <th>Status</th>
            <th>Steam64 ID</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-border align-top">
              <td className="py-1.5">{e.nickname}</td>
              <td>{e.realName ?? "—"}</td>
              <td>
                {e.teamName}{" "}
              </td>
              <td>
                <Badge variant="outline">{e.matchStatus}</Badge>
              </td>
              <td>
                <SteamIdEditor
                  key={`${e.id}-${e.steamid64}`}
                  rosterEntryId={e.id}
                  currentSteamid64={e.steamid64}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching entries.</p>
      ) : null}
    </div>
  )
}
