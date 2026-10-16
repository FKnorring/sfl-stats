# 0015: HLTV 2.0 approximation stored beside SFL Rating

## Status

Accepted

## Context

SFL Rating v2 is a custom model. Users also want the familiar HLTV 2.0 number.
HLTV has never published the formula; the community-reverse-engineered version
is `0.0073 KAST + 0.3591 KPR - 0.5329 DPR + 0.2372 Impact + 0.0032 ADR + 0.1587`
with `Impact = 2.13 KPR + 0.42 APR - 0.41`.

## Decision

- Compute it in `lib/hltv-rating.ts` from the same retained player-round facts
  as SFL Rating (raw kills, assists plus flash assists, capped damage, KAST).
- Store it in `player_match_stats.hltv_rating` / `hltv_rating_version`
  (`hltv2-approx-v1`), written by the same ingestion and `rate:demos` recompute
  paths. The public app stays read-only (ADR 0002).
- Averages are simple means of per-Demo ratings and gated on the version, like
  SFL Rating. Changing the formula needs a version bump and a backfill.
- UI always labels it an unofficial approximation, never as HLTV's own rating.

## Consequences

Existing rated Demos need `npm run rate:demos` (recompute) to backfill the new
columns; until then HLTV 2.0 shows as unrated.
