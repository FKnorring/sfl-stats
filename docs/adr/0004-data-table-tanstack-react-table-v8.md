# DataTable abstraction on TanStack Table v8, sorting split from server-side data selection

Every table in the app (leaderboard, team standings, team roster, team compare roster, player team/match history, team map stats) was hand-rolled directly over `components/ui/table.tsx`'s primitives — same `<Table><TableHeader><TableRow><TableHead>…` boilerplate repeated six times, no column sorting, no search, and a separately hand-written empty-state row each time (see #1). This introduces a reusable `DataTable` abstraction (`components/data-table/`) to replace all six.

## Engine: `@tanstack/react-table` v8, not v9

v9 is still in beta at the time of writing and changes its API around opt-in "features" (see shadcn's current data-table docs, which already target the v9 beta). We pin to the stable v8 line (`^8.21.3`) instead — a production app shouldn't depend on a beta API surface that's still shifting.

## Headless, composed onto the existing `Table` primitive — not a drop-in grid component

`@tanstack/react-table` is headless: it manages state (sorting, filtering) and row/column models, and `DataTable` renders that state through the project's existing shadcn `Table`/`TableHeader`/`TableRow`/`TableHead`/`TableCell` components, not a self-contained styled grid. This keeps the existing Tailwind styling and base-nova shadcn conventions already established in `components/ui/table.tsx` and matches the "you own the code" philosophy the rest of `components/ui/` follows. A pre-styled grid library (e.g. a MUI/AG Grid style component) was not considered seriously for this reason — it would mean a second, inconsistent table visual language alongside the existing one.

## Column sort is client-side and independent of server-side data selection

The leaderboard and team-standings pages already pick *which* rows to fetch via server-side Drizzle SQL, driven by Select-based URL-param filters (season/division/team/stat — see `components/leaderboard-filters.tsx`). `DataTable`'s column-click sorting does not touch that: it's a plain client-side re-sort of whatever page of rows was already fetched, using `getSortedRowModel`. Clicking a column header never changes the URL or triggers a refetch.

We considered unifying the two — e.g. having a column click update the `stat` URL param and resort via SQL — and rejected it: there's no pagination today, result sets are small enough that fetching everything and sorting client-side is simpler, and unifying would mean `DataTable`'s generic API would need to know about page-specific URL/query params, defeating the point of a reusable component. Future tables should follow the same split: server-side logic decides what to fetch, `DataTable` only sorts/searches what it's given.

## No pagination, row-selection, or column-visibility features

Out of scope for this change — no table in the app currently paginates, and adding those TanStack Table features now would be speculative. If a table grows large enough to need pagination later, add it to `DataTable` as an opt-in feature at that point rather than building it in now.
