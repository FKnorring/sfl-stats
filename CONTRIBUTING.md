# Contributing

## 1. Find or create an issue

- Check [open issues](https://github.com/FKnorring/sfl-stats/issues) first —
  someone may already be on it, or there's context you'll want to read
  before starting.
- If nothing fits, open a new issue describing the bug or feature before
  writing code. Keep it scoped to one concern.
- Comment on the issue (or assign yourself) before starting work, so two
  people don't duplicate effort.

## 2. Branch

Branch off `main`, named after the issue:

```bash
git checkout main
git pull
git checkout -b <issue-number>-short-description
# e.g. git checkout -b 12-fix-stat-fanout
```

## 3. Make your change

- Run `pnpm lint`, `pnpm typecheck`, and `pnpm format` before committing.
- Keep commits focused; write commit messages that explain *why*, not just
  *what*.
- If your change affects the schema (`lib/schema.sql`) or a script's
  CLI flags, update the [README](README.md) in the same PR.

## 4. Open a PR

- Push your branch and open a PR against `main`.
- **Link the issue** so it closes automatically on merge — include one of
  the following in the PR description:

  ```
  Closes #12
  Fixes #12
  Resolves #12
  ```

- Describe what changed and why, and call out anything you intentionally
  left out of scope (e.g. "didn't touch X, tracked separately in #19").
- If the change is user-visible (new page, new filter, etc.), include a
  screenshot.

## 5. Review

- Address review comments as new commits (don't force-push over feedback
  mid-review) — squash before merge if you want a clean history.
- Once approved, merge via squash so `main` stays linear.
