# Branching: match the issue

Before writing any code for an issue, check out a branch named for that
issue, per `CONTRIBUTING.md`'s `<issue-number>-short-description`
convention (e.g. `6-faceit-steam-icons`).

## Before starting implementation

1. Note the issue number you're implementing (from the user's request, or
   from `gh issue view <number>`).
2. Check the current branch name against it: `git branch --show-current`.
3. If the current branch isn't `main` and doesn't start with
   `<issue-number>-`, **stop and branch off `main` first**:
   ```bash
   git checkout main
   git pull
   git checkout -b <issue-number>-short-description
   ```
   Do not commit implementation work to whatever branch happens to be
   checked out — a branch left over from unrelated work, or `main` itself.
4. If no issue number applies (a drive-by fix, a chore with no ticket), ask
   the user, or branch with a descriptive name and flag that there's no
   issue to link.

## After committing

Once the implementation is committed and verified (typecheck/lint/tests
pass), open a PR against `main` per `CONTRIBUTING.md` step 4 — push the
branch and `gh pr create`, with `Closes #<n>` in the body so the issue
closes on merge.
