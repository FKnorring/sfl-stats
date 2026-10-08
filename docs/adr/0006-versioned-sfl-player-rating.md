# Versioned SFL player ratings from retained round facts

## Decision

Use **SFL Rating v1**, a transparent custom model, rather than pretending
to reproduce a proprietary HLTV rating. The linked K02D/HLTV-Rating notebook
requires an absent training dataset and trained model; its feature importance
is not a scoring formula. The installed demoparser 0.42.0 provides the events
and snapshots needed to derive our own metrics without another dependency.

Store validated competitive rounds and player-round facts. CLI ingestion and
historical enrichment write those facts and ratings; the public application
only reads them. Retaining facts permits database-only recomputation without
redownloading demos. Preserve legacy aggregate stats, matching, heatmaps,
default sorts, and ADR-based follow-team MVP selection.

## Definitions

Only a complete recording ending in the parser's observed finished game phase
is eligible. Require consecutive competitive round boundaries, a decided
winner, participant snapshots, and reliable event identities/sides. Initial
null-winner round-end events, warmup, and post-round actions are excluded.
Invalid or incomplete demos remain visible with null ratings and explicit
reasons. Missing metadata is never silently estimated.

Participation means an identified human player alive on T/CT at freeze end.
Leavers and substitutes have their own participated-round denominator; never
assume the final scoreboard contains everyone or ten fixed players throughout.
Missing mid-round entrants/start snapshots or inconsistent end survival make
the extraction unavailable, rather than granting disconnected players free
survival. Sides are observed per round, including overtime, not inferred from
team roster identities.

- Combat: enemy kills per participated round.
- Damage: enemy health damage per participated round, capped to remaining
  victim health from ordered hurt transitions. Tick-level health snapshots
  can lag multiple hits in the same tick, so they are used only to initialize
  each round's health. Exclude self/friendly/world damage.
- Consistency: KAST, a union of kill, valid damage/flash assist, survival, or
  traded death. A round counts at most once.
- Survival: rounds survived / participated rounds. World and team deaths
  still prevent survival but grant no combat rewards.
- Impact: equal mean of normalized multi-kill strength, opening-kill rate,
  and clutch-win rate. Multi-kill strength is `max(enemy kills - 1, 0)`.
  The opening is the first enemy kill. A clutch win means the player became
  the sole living teammate against living opponents and their side won the
  round, including bomb outcomes; final survival is not required.
- Support: equal mean of normalized damage-assist rate, flash-assist rate,
  and enemy utility damage per round. Damage/flash assists are disjoint.
  Observed friendly-damage assists grant no support.

Trade window is three seconds using verified parser `game_time`. A surviving
teammate kills the original killer in the same round; suicides, team kills,
world deaths, and cross-round kills do not qualify. This is our rule, not a
claim about HLTV's private definition.

Round-start equipment is retained for analysis but not weighted in v1.

## Frozen model

For every metric, divide the player's per-round rate by the pooled reference
rate in `RATING_REFERENCE`. Combine components with weights:

| Combat | Damage | Consistency | Survival | Impact | Support |
| -----: | -----: | ----------: | -------: | -----: | ------: |
|    25% |    20% |         20% |      10% |    15% |     10% |

`data/rating-v1-reference.json` records the frozen corpus: 26 complete SFL09
demos, 258 player-games, and 5,374 participated player-rounds. Two historical
short artifacts are excluded. All weighted reference rates are positive.
Reproduction against the originals is covered by the optional
`SFL_RATING_DEMOS` regression test. Full precision is retained; only display
rounds to two decimals. No arbitrary score cap is imposed.

The reference corpus round-weighted mean is 1.00 within numerical tolerance.
Initial player-demo scores range approximately 0.23-2.38. Review of extracted
standouts shows the top partial participant played five rounds, so the UI
must retain participated-round context; a high rating is not evidence of a
large sample. Rare clutch/flash events can materially increase impact/support.
Observed component outliers and support-heavy performances were checked
against retained facts, not independent expert match reviews.

**This model remains provisional.** The corpus is small, from one league
period, and combat/damage/KAST overlap. There is no independently labeled
ground truth or demonstrated improvement over HLTV. Role/side/map and
rare-event sensitivity need further review before treating this as a
validated performance ranking. No ML model or economy correction is included.

Freeze references and weights by rating version: new ingestion must not
change past ratings. Any change to scoring or extraction semantics that
changes outcomes requires a version/reference review and explicit backfill.
Displayed averages include only the current version and weight by each
player's participated rounds, with rated-game coverage. Nulls sort last in
either direction. Rating aggregation must not multiply contributions because
of duplicated roster claims.

## Operations and failure handling

Enrichment matches existing demos by Unicode-normalized stable basename and
does not create new matches. It atomically replaces round facts, adds only
verified missing players/stat rows, and updates rating availability. Existing
stat rows are otherwise untouched. A failed or unavailable re-enrichment
cannot leave a previous successful rating displayed as current.

When adding a player absent from the final scoreboard, record a final CT/T
slot only if that player participated in the last round. A leaver's
pre-halftime side is not a reliable final slot; leave it unresolved rather
than assigning the player to the wrong demo-scoreboard team.

The CLI supports dry-run, individual match selection, and database-only
recomputation. Unexpected parsing/write failures are logged and fail the
command. Missing originals/invalid recordings are reported as explicit
unrated outcomes. Back up the configured local/hosted database before
migration and historical enrichment. Never store demo files or credentials
in Git.

## Alternatives

A public Rating 2.0-style approximation was considered, but the agreed goal
was a custom SFL score weighting opening/clutch and support information
directly. A database-only score based on K/D/A and ADR was rejected because
existing aggregates cannot reconstruct KAST, trades, and participation.
Importing the linked notebook would add an unnecessary ML runtime without
its missing training inputs and would not solve data completeness.
