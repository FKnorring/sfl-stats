# sfl-stats

Stats and scouting glossary for the Svenska Företagsligan (SFL) CS2 league: identifying players across sources, and the stats pipeline that feeds the leaderboard and team-scouting views.

## Language

**Player**:
A verified Steam identity (`steamid64`), observed directly in a parsed Demo. This is ground truth — it exists independently of any team or roster claim.
_Avoid_: Account, user.

**Roster Entry**:
A claimed nickname on a team's published roster for a given Season/Division, as scraped from the SFL site. Not yet a Player — it's a claim about identity, not a verified one, until Matching resolves it to a `steamid64`.
_Avoid_: Player (before matching), roster player.

**Matching**:
The process of resolving a Roster Entry's claimed nickname to the Player who actually appeared in-game under that name, by comparing in-demo names against roster nicknames (string similarity) or an explicit manual link. Produces a confidence score and one of: auto-resolved, Needs Review, or unmatched.
_Avoid_: Linking, mapping (reserve "mapping" for the CS2 map).

**Needs Review**:
A Roster Entry that Matching could not confidently resolve to exactly one Player — either because the best candidate scored below the confidence threshold, or because two or more candidates tied for best and neither could be ruled out. Requires a human to resolve it (confirm, correct, or dismiss). The underlying reason (low-confidence vs. tied) is an implementation detail, not a separate domain concept.
_Avoid_: Ambiguous, low-confidence match, pending.

**Demo**:
One parsed `.dem` file. Currently the unit the pipeline actually ingests and stores (one row per file in the `matches` table) — not necessarily the same thing as a Match (see gap below).
_Avoid_: Match (when specifically meaning the file), replay.

**Match** _(relationship to Demo unconfirmed — see Open Gaps)_:
A single game of CS2 between two teams within the league structure: one map, in a Bo1 (group stage) or as one game within a Bo3 (playoffs). Whether one Demo always equals one Match, or a Match/series can span or be split across multiple Demos, is not yet confirmed.
_Avoid_: Series, round (reserve "round" for an in-game round within a match).

**Season**:
A numbered league cycle (e.g. "SFL Säsong 9"). Teams are scoped to exactly one Season + Division.

**Division**:
A competitive tier within a Season (e.g. "Division 1", "2A"). Teams compete within their Division.

**Faceit Profile**:
A Faceit account linked to a Player once a `steamid64` match is established. Distinct from the Player's SFL/demo identity — Faceit stats (elo, skill level, recent match history) are supplementary signal, not the source of truth for league stats.
_Avoid_: Faceit account (fine informally, but prefer "Profile" in glossary contexts to parallel "Roster Entry").

## Open Gaps

- **Demo ↔ Match relationship is unconfirmed.** Group stage is Bo1, playoffs are Bo3. It's not yet known whether playoff Demos map 1:1 to Matches, whether a Bo3 produces 3 separate Demos (one per map) that collectively form one Match, or whether a single Demo could span multiple Matches. The current schema (`matches` table, one row per Demo file) assumes 1 Demo = 1 Match, which may be wrong for playoffs. **Once confirmed, file a GitHub issue** if the schema needs to change to model a Match as a group of Demos (or vice versa) — don't assume the current schema is correct until then.
