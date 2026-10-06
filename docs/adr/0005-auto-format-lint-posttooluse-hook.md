# Auto-format and lint files via a Claude Code PostToolUse hook, shared project-wide

Claude Code (and any other agent working against this repo) can leave files unformatted or with lint issues after a `Write` or `Edit` tool call. Previously this was only caught at commit time or in CI, after the fact.

Claude Code supports a `PostToolUse` hook: a shell command the harness runs automatically after a tool call completes, matched by tool name. Project-level hooks live in `.claude/settings.json`, which (unlike `.claude/settings.local.json`) is committed, so the behavior is shared by everyone working in this repo through Claude Code — not just a per-developer preference.

The hook is matched on `Write|Edit` and, for `.ts`/`.tsx`/`.js`/`.jsx` files, runs `prettier --write` followed by `eslint --fix` on just the touched file (not the whole repo, to keep it fast). It's best-effort: stderr is suppressed and the hook always exits successfully. If `eslint --fix` can't auto-fix something, it leaves that error in place rather than blocking the agent — normal `npm run lint` / CI still catches it later. Other file types are left untouched.

We considered making the hook block/surface remaining lint errors back to the agent, but decided silent best-effort was the safer default: a hook that can halt a tool call on an unrelated pre-existing lint error is a worse failure mode than occasionally leaving an unfixable issue for CI to catch.
