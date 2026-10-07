# Matches page: cached live schedule and shared client-side filters

The identity and score presentation policy below is amended by
ADR-0008 for issue #65; the schedule, filtering and read-only decisions remain.

Issue #51 adds `/matches`, combining upcoming Toornament fixtures and
ingested-demo history. The existing schedule parser and live fetcher are
reused; the page does not depend on a schedule-scrape run and never writes
the fetched data to the database (ADR-0002).

The schedule fetch retains its five-minute Next.js fetch cache. The page
uses `connection()` for request-time database reads rather than
`dynamic = "force-dynamic"`: the installed Next.js version documents that
the latter disables fetch caching, including explicit revalidation.
Expected network/HTTP failures are logged and shown as an unavailable
schedule, not a successful empty list or a silent scraped-data fallback.
History remains usable when the schedule is unavailable.

One client view owns the division selector and team-name search, applying
them immediately to both sections. This is intentionally different from
the URL-backed leaderboard controls: refetching the server page for each
keystroke is unnecessary when both complete datasets are already present.
ADR-0004's separation remains intact: the server determines eligible
history, page controls filter the two datasets, and the existing DataTable
only sorts its supplied history rows. No generic DataTable filtering API,
pagination, or new dependencies are introduced.

Demo history is rooted in `matches`, not concatenated per-team histories,
so each eligible demo appears once, including unresolved demos. Stored
team identities take precedence over read-only roster-majority fallback
names. Demos attributable exclusively to pre-S9 teams are excluded;
unattributed and mixed-season demos remain. Division attribution is S9+
only. Live raw opponent names are resolved conservatively against the
current season for division filtering; ambiguous names remain unresolved
but still display and participate in search.

Only stored demo scores are shown. An official series result is not a
per-demo score, so the official-score inference used by some existing
detail/team views is intentionally not used here. Missing identities,
scores, dates, and division attribution stay explicit rather than guessed.
Dates are formatted in Stockholm time to avoid server/client timezone
differences.

The page starts with all divisions and no search. There is no season
selector or result cap. Pagination or virtualization should be added only
if real dataset growth makes the existing all-rows approach insufficient.
