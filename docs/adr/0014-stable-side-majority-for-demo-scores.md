# Stable-side majorities resolve scores with extra roster matches

When a demo contains more than two distinct roster-team assignments, score
attribution votes for a team independently on each stable side, using the
existing kill-derived stable-side evidence. Resolve the score only when each
side has a unique leading roster team and the two selected team IDs differ.
Players assigned to non-leading teams do not contribute to per-round score
side votes. Tied or missing side votes, or the same team leading on both
sides, leave the score unresolved.

With zero or one distinct roster team, preserve the existing unresolved-score
and Toornament opponent-inference behavior. With exactly two roster teams,
preserve existing per-round side scoring. Toornament opponent inference never
supplies a demo score.

This addresses false additional team assignments, such as one low-confidence
player match, without discarding otherwise strong team evidence. A global
top-two vote was rejected because it could select two teams represented on
the same stable side. No schema, dependency, or public-app write is needed.
