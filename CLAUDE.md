@AGENTS.md

## Agent skills

### Issue tracker

Issues (and external PRs) are tracked on GitHub at FKnorring/sfl-stats, using the `gh` CLI. External PRs are a triage surface. See `docs/agents/issue-tracker.md`.

### Branching

Before starting implementation on an issue, make sure the checked-out branch is named for that issue — never commit implementation work to `main` or to a branch left over from unrelated work. See `docs/agents/branching.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — independent of this repo's existing type/priority labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet). See `docs/agents/domain.md`.
