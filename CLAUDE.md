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
6. Commit and push finished, checked work on your own, without asking the user each time (they asked for this
   on 2026-11-13: «انقدر از من نپرس… خودت خودکار انجام بده»). Still check the diff for sensitive data first, and
   keep big binaries out of git.

Memory files under `~/.claude/` are per account, so the other Claude can't see yours. Anything the other
one needs to know goes in this file or in the project docs, not only in your own memory.

The user opens many conversations, and either Claude may pick up any task. So write each decision the user
makes, and anything new you learn that the other Claude would need (what a tool or service can or can't do, a
connection set up, a price, a limit, a workaround that worked), into the project docs (`IDEAS.md`, `art/STYLE.md`,
`REDESIGN.md`, `HOOSHVAREH.md` or this file) as soon as it happens, with the date, not at the end of the session:
what was decided or found, what was rejected, and where the work stands. Before starting on a topic, read what is already written about it, so two decisions on the same thing never
exist side by side. When a new decision replaces an old one, change or mark the old line instead of leaving both.
(The user asked for this on 2026-11-13.)

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
  folder's server); then use `tanara-5180` (`http://127.0.0.1:5180`). On 2026-11-12 `127.0.0.1:5180` served an
  old copy of the app (another server); then use `tanara-5190`. Check with a fetch that the page has your change. On 2026-11-17 the Browser pane's `127.0.0.1:5190` served a stale copy
  while `curl` from the shell saw the new file; `preview_start` with `tanara-static` (opened at `localhost:5173`) showed the current files.
- Since 2026-11-19 the app opens from the service worker's copy (`sw.js`): its code is never fetched while it opens. Once loaded,
  and whenever the person comes back to it, the worker fetches every code file again and, if anything changed, puts the whole
  new version in the cache and the page reloads by itself (at once if untouched; otherwise on coming back, never with a sheet open
  or unsent text). So on `127.0.0.1` (where the worker runs) an edit shows a moment after the reload, by a second reload the app
  does itself; `localhost` has no worker and always shows the files as they are. A new file in the app still needs adding to
  `SHELL` and a new `CACHE` name.
- Edge Functions deploy from this folder with the Supabase CLI (logged in on `m.b.a` on 2026-11-09):
  `npx supabase functions deploy <name> --project-ref whmzjvmeyxdoqjtkukix --yes` (`hooshvareh` is too big to send
  through the Supabase MCP tool). Since 2026-11-17 deploy on your own after pushing checked work, without asking the user
  («از این به بعد به صورت خودکار انجام بده»); before that the rule was to ask first. Claude Code's auto-mode check may still
  refuse the deploy call: then tell the user, who can add an allow rule (see below), and don't work around it. `ClaudeAccount` has no CLI login: after
  pushing, it deploys with the MCP tool a one-line `index.ts` that imports
  `https://raw.githubusercontent.com/tanara-app/TanAra/<full commit hash>/supabase/functions/<name>/index.ts`
  (verify_jwt true for `hooshvareh`), as on 2026-11-11 (version 45), 2026-11-12 (version 47) and 2026-11-13 (version 48). On 2026-11-15
  `m.b.a` deployed version 49 with the CLI (commit 8ee2b03, the «ثبت کامل» / «ثبت ناقص» marks). The same day `ClaudeAccount` deployed
  version 50 with the MCP tool (commit 3371b05, carbohydrate and sodium of own foods, the «پیشرفت» pace; 8ee2b03 is in it).
  On 2026-11-17 `ClaudeAccount` deployed version 51 with the MCP tool (commit 02c67b2, low HDL and SGLT2 drug rules). The auto-mode
  check refused that deploy once and refused writing `.claude/settings.json` (an allow rule for the MCP deploy tool and
  `Bash(npx supabase functions deploy *)`); the user has to add that file themselves. The same day `ClaudeAccount` deployed version 52
  (commit 734e209, the `lab` mode for «آزمایش خون»); that deploy went through. On 2026-11-18 `ClaudeAccount` deployed version 53 with the MCP tool
  (commit 2b2ab89: the removed diet plan and screen-only profile keys no longer go to the assistant). It boots (OPTIONS 200), but no
  answer could be checked: the Anthropic credit was still empty that day. On 2026-11-19 `ClaudeAccount` deployed version 54 the same way (commit f8998b5:
  the tip mode gone, the chat sees today's tip from TIPS.md); it boots (OPTIONS 200). Later that day it deployed version 55 the same way (commit 863b7cb:
  `lateNight`, the app's day starting at 5 am); it boots (OPTIONS 200).
- From 2026-11-16 04:22 UTC every `hooshvareh` call failed with 502 (still so on 2026-11-18): the Anthropic API answered «credit balance is too low». Only the
  user can add credit (console.anthropic.com, Plans & Billing). Check the function logs for it when the assistant stops answering.
- On 2026-11-17 the user installed the official Meshy plugin (claude.ai directory, by Meshy) with three skills:
  `meshy-3d-generation`, `meshy-3d-printing`, `meshy-openclaw`. It belongs to the claude.ai account, not this folder
  (on `m.b.a` it is cached under `~/Library/Application Support/Claude/local-agent-mode-sessions/…/rpm/plugin_01LLaHeMvnzBdyHYEGGSUNZi/`).
  If `ClaudeAccount` uses another claude.ai account, it does not have these skills.
- Trying an animated page by yourself: when the Browser pane is hidden, the page gets no animation frames and CSS transitions stand
  still, so screenshots show a half-loaded screen. Use the Playwright MCP browser (`mcp__plugin_parallax-threejs_playwright-mcp__*`,
  viewport 375×812) instead; it writes into `.playwright-mcp/` in this folder, so delete that folder when done. Keep each Playwright call
  short: on 2026-11-18 a `browser_run_code_unsafe` with `page.goto`/`page.reload` inside hung for 30 minutes; navigate with `browser_navigate`
  and check with `browser_evaluate`. In `?local` mode the app starts at the questionnaire: to skip it, set
  `localStorage['tanara:local:state']` to `{"profile":{"user_id":"local","data":{"onboarded":true}}}` and reload.
- Tests: `node tests/run.js` (or open `tests/index.html` in the browser).
- The user speaks Persian; answer in Persian.
- ElevenLabs (the mascot's voice): always the newest model, and ask the user before generating anything
  (voice, model, which lines). The voice is the user's own «Heimerdinger»; never pick an older model on your own.
- No emoji anywhere in the app's UI (no 🏆, ✓ as emoji, etc.): draw icons as inline SVG like the existing ones
  in `js/ui/dom.js`. The mascot appears only where it already is; don't add him to new screens unasked.
- Keep text in the app to a minimum: no hint lines or explanations under things unless the user asks
  (on 2026-11-09 they were annoyed by a «نگه دار و بکش» hint under the tools grid).
  On 2026-11-10 they said again that we keep adding too much text and that it distracts: a number goes
  where the user already looks (e.g. «۶۱۲ از ۶۳۲ کالری» in the total, not a separate «سهم شام امروز…» line),
  and an action that can be an icon is an icon (undo instead of «برگشت به پیشنهاد اپ»). Before adding any
  sentence, label or link to the UI, ask whether the screen works without it.
- Anything that only some members have (a beta in `profile.beta`, not yet released to everyone) carries the word
  «آزمایشی» next to its name where it is opened (e.g. «سهم وعده آزمایشی» in its tab). The user asked for this on 2026-11-12. Remove the word when it is released to all.
- On 2026-11-12 a «تازه‌ها» page (the app's changes, with an unread count and a one-time sheet) was built
  and removed the same day: the user didn't like it. Don't bring it back unless they ask.
- **On 2026-11-18 the user had the whole game removed** («سرقت بزرگ» and the older «باغ»: code, pictures, sounds, 3D models, tests,
  docs, the `heist` tables, functions and Edge Function, and `game` in `profile.beta`), after being unhappy with its tutorial
  («دیگه خسته شدم کلا بخش بازی رو حذف کن»). Don't build a game again unless the user asks. «سرزمین خانواده» in «پیشرفت» is not the
  game and stays.
- **The game «تنگاتنگ» (2026-11-18, the user asked for it):** a ready-made game downloaded from the internet as a reward in «جوایز»
  that becomes a tile in «بیشتر» once earned. The user's rule: it must not be on Google Play and must be new to members (2048 was
  rejected for that). It is PACKABUNCHAS by Mattia Fortunati (js13kGames 2021, mobile winners, MIT), in Persian, in
  `games/tangatang/` (keep its `LICENSE`). Downloaded games are allowed this way; still don't build a game of our own unasked.
- **Rewards count only from the day they are added (the user's rule, 2026-11-19):** a reward's goal never counts days from before
  the reward existed. Every entry of `REWARDS` in `js/domain/rewards.js` has `since` (the day it ships; one released late at night
  starts the next day), and `progress` only looks at days from `since` on. Give every new reward its `since`.
- Build only what the user agreed to. When a reply could mean more than one of the options you offered,
  ask which ones before building (on 2026-11-08 a shared «team goal» was built that the user hadn't asked for).

## Where things are

- Plain-JS PWA with no build step: `index.html`, `js/app.js`, `js/ui/` (screens), `js/domain/` (pure logic,
  tested in `tests/`), `js/data/` (local store and Supabase sync), `sw.js` (service worker).
- `supabase/`: migrations and the Edge Functions `hooshvareh` (the AI assistant, Claude via Anthropic API)
  and `remind` (push reminders).
- `FEEDBACK.md`: how to read users' reports (table `feedback`, photos via `tools/feedback-photos.mjs`).
- `HOOSHVAREH.md`: everything the AI assistant and the app do. Keep it up to date with every new feature.
- `art/STYLE.md`: how the app's own pictures (the «بیشتر» icons) are made.
- `REDESIGN.md`: the rebuild of «امروز» and «رژیم» into one part, step by step: what the user decided so far. Read it before
  touching the today screen, «سهم وعده» or «رژیم».
- `SAHM.md`: the road map to a professional «سهم وعده» algorithm (from 2026-11-20): the current algorithm's weak points,
  eight phases with exit gates, and the user's decisions on it. Read it before touching `fitMeal` or `mealBudget`.
- `TIPS.md`: the fixed list of daily tips («نکته‌ی امروز»), about 365, written once by Claude from established science only
  (the user decided on 2026-11-18 to replace the tips Hooshvareh writes every day). Each tip has tags saying who sees it. In the
  app since 2026-11-19: `js/ui/tip.js`, picked in `js/domain/tips.js`; after editing TIPS.md run `node tools/tips.mjs`, which
  rewrites `js/data/tips.js`.
- `LABS.md`: the lab-results tool («آزمایش خون» in «بیشتر», from 2026-11-17): PDF upload, the original kept for download,
  trends per test, condition suggestions. The user's decisions and where the work stands.
- `IDEAS.md`: ideas for daily "hooks" that bring members back, with the ones the user picked. When one gets built,
  mark it there.
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
