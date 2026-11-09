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
4. Check for new user reports (bugs, complaints, ideas sent from «نمایه» ← «تنظیمات» ← «گزارش خرابی و انتقاد») and show
   them to the user before anything else, as `FEEDBACK.md` says. Mark the ones you showed as `seen`.
5. Commit only the files you changed, never `git add -A`. Before pushing, fetch again and merge or rebase
   if `origin/main` moved.

Memory files under `~/.claude/` are per account, so the other Claude can't see yours. Anything the other
one needs to know goes in this file or in the project docs, not only in your own memory.

## Practical details

- The folder belongs to `m.b.a`; `ClaudeAccount` writes through an ACL. If a write fails with
  "Permission denied", ask the user to fix the ACL from the `m.b.a` account rather than working around it.
- For `ClaudeAccount` git reports "dubious ownership". Run git as `git -c safe.directory='*' …` instead of
  changing the global git config.
- Both Claudes work directly in this shared folder (no other copy). The dev server is `tanara-static`
  in `.claude/launch.json` (port 5173); both accounts use it. Open it at `http://127.0.0.1:5173`,
  never `localhost:5173`: an old `http.server 5173` without `--bind` (started on 2026-10-30 from
  `m.b.a`, from another folder) answered `localhost` with 404 for every page. If "Port in use"
  comes up, the server is probably already running under the other account; just navigate to
  `127.0.0.1:5173`. On 2026-11-08 `127.0.0.1:5173` itself answered 404 for every page (another
  folder's server); then use `tanara-5180` (`http://127.0.0.1:5180`).
- Tests: `node tests/run.js` (or open `tests/index.html` in the browser).
- The user speaks Persian; answer in Persian.
- ElevenLabs (the mascot's voice): always the newest model, and ask the user before generating anything
  (voice, model, which lines). The voice is the user's own «Heimerdinger»; never pick an older model on your own.
- No emoji anywhere in the app's UI (no 🏆, ✓ as emoji, etc.): draw icons as inline SVG like the existing ones
  in `js/ui/dom.js`. The mascot appears only where it already is; don't add him to new screens unasked.
- Build only what the user agreed to. When a reply could mean more than one of the options you offered,
  ask which ones before building (on 2026-11-08 a shared «team goal» was built that the user hadn't asked for).

## Waiting to deploy

- `supabase/functions/hooshvareh/index.ts`: since 2026-11-09 git has one line the live function doesn't (reminders are now in
  «نمایه» ← «تنظیمات» ← «یادآورها»). The user chose to deploy it with the next hooshvareh change; deploy it then and remove this note.

## Where things are

- Plain-JS PWA with no build step: `index.html`, `js/app.js`, `js/ui/` (screens), `js/domain/` (pure logic,
  tested in `tests/`), `js/data/` (local store and Supabase sync), `sw.js` (service worker).
- `supabase/`: migrations and the Edge Functions `hooshvareh` (the AI assistant, Claude via Anthropic API)
  and `remind` (push reminders).
- `FEEDBACK.md`: how to read users' reports (table `feedback`, photos via `tools/feedback-photos.mjs`).
- `HOOSHVAREH.md`: everything the AI assistant and the app do. Keep it up to date with every new feature.
- `VOICE.md` / `ELEVENLABS.md`: the mascot Heimerdinger's lines and the brief for recording them
  (files in `audio/mascot/`). If a line changes in `js/ui/mascot.js`, update both.

## Sensitive data never goes in git

The GitHub repo is public. Users' emails, names, family relations, health data, API keys, tokens,
passwords and service_role keys must never go in a tracked file, a commit message, a PR or anything
pushed. Keep them in git-ignored, permission-restricted files (`.claude/private/`) or in Supabase
secrets, and check the diff for them before every commit.

## App users (private)

Who each account in the app is lives in `.claude/private/USERS.md`, readable only by `m.b.a` and
`ClaudeAccount` and ignored by git. Read it when you need to know who a user is. Never copy its
contents into a tracked file, a commit, the app, or anything published. When a new account shows up
in `auth.users`, ask the user who it is and add a row there.
