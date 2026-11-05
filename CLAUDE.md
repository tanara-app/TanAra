# TanAra (تن‌آرا): notes for Claude

## Two Claudes work on this project, one at a time

This folder (`/Users/Shared/Claude-Shared/TanAra`) is shared by two Claude Code sessions that run under
two macOS accounts on the same Mac:

- `m.b.a`: the first Claude, which built the app so far.
- `ClaudeAccount`: the second Claude, which joined on 2026-11-05 to continue the upgrades whenever the
  first one hits its usage limit.

The user never runs both at the same time, but either one may have worked here since your last session.
So at the start of every session:

1. Run `git fetch` and `git log --oneline -10` to see what the other Claude did.
2. Run `git status`. Uncommitted or untracked files may be the other Claude's unfinished work.
   Don't edit, commit or delete them unless the user says so; ask first.
3. Read `HOOSHVAREH.md` for the current feature list before adding or changing anything.
4. Commit only the files you changed, never `git add -A`. Before pushing, fetch again and merge or rebase
   if `origin/main` moved.

Memory files under `~/.claude/` are per account, so the other Claude can't see yours. Anything the other
one needs to know goes in this file or in the project docs, not only in your own memory.

## Practical details

- The folder belongs to `m.b.a`; `ClaudeAccount` writes through an ACL. If a write fails with
  "Permission denied", ask the user to fix the ACL from the `m.b.a` account rather than working around it.
- For `ClaudeAccount` git reports "dubious ownership". Run git as `git -c safe.directory='*' …` instead of
  changing the global git config.
- Both Claudes work directly in this shared folder (no other copy). The dev server is `tanara-static`
  in `.claude/launch.json` (port 5173); both accounts use it.
- Tests: `node tests/run.js` (or open `tests/index.html` in the browser).
- The user speaks Persian; answer in Persian.

## Where things are

- Plain-JS PWA with no build step: `index.html`, `js/app.js`, `js/ui/` (screens), `js/domain/` (pure logic,
  tested in `tests/`), `js/data/` (local store and Supabase sync), `sw.js` (service worker).
- `supabase/`: migrations and the Edge Functions `hooshvareh` (the AI assistant, Claude via Anthropic API)
  and `remind` (push reminders).
- `HOOSHVAREH.md`: everything the AI assistant and the app do. Keep it up to date with every new feature.
- `VOICE.md` / `ELEVENLABS.md`: the mascot Heimerdinger's lines and the brief for recording them
  (files in `audio/mascot/`). If a line changes in `js/ui/mascot.js`, update both.
