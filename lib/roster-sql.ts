export const ROSTER_WITH_TEAM_CTE = `
roster_with_team AS (
  SELECT
    re.id AS rosterEntryId,
    re.team_id AS teamId,
    re.nickname AS nickname,
    re.real_name AS realName,
    re.matched_steamid64 AS steamid64,
    re.match_status AS matchStatus,
    re.match_confidence AS matchConfidence,
    t.name AS teamName,
    t.season AS season,
    t.division AS division
  FROM roster_entries re
  JOIN teams t ON t.id = re.team_id
)
`

export const MATCHED_TEAM_PLAYERS_CTE = `
matched_team_players AS (
  SELECT DISTINCT
    roster_with_team.teamId AS teamId,
    roster_with_team.steamid64 AS steamid64
  FROM roster_with_team
  WHERE roster_with_team.steamid64 IS NOT NULL
)
`
