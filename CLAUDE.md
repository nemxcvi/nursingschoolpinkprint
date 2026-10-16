# Nursing School Pinkprint

Flashcards, practice quizzes and study guides for nursing students (NUR 114, then NUR 121), drafted from ATI and lecture material.

- Live site: https://nursingschoolpinkprint.com
- Repo: `nemxcvi/nursingschoolpinkprint`
- Plain static HTML/CSS/JS in `nursing-study-site/`. No build step, no package manager, no tests.

## Hosting and deploys

- Hosted on **Cloudflare Pages**, project **`nursingschoolprep`**, connected to this GitHub repo. The site root is `nursing-study-site/`.
- `main` deploys to production (nursingschoolpinkprint.com).
- Every other branch gets a preview deploy at `https://<branch-alias>.nursingschoolprep.pages.dev/`. The alias is the branch name lowercased, with anything that isn't a letter or number turned into `-`. Cloudflare shortens long aliases, so keep branch names short, e.g. `preview-study-guide-and-nav` → https://preview-study-guide-and-nav.nursingschoolprep.pages.dev/.
- The Cloudflare tools in Claude sessions can't list or trigger Pages builds, so build status is checked in the Cloudflare dashboard (Workers & Pages → nursingschoolprep → Deployments).

## How to ship a change (always follow this)

1. Work on a short preview branch (e.g. `preview-<topic>`). If the session assigned a branch, use that one.
2. Push it and give the owner the preview link: `https://<branch-alias>.nursingschoolprep.pages.dev/`.
3. **Wait for explicit approval.** Never push to `main` before the owner OKs the preview.
4. After approval, fast-forward or merge the branch into `main` and push. That deploys to production.

## Site structure

- `nursing-study-site/assets/site-data.js` is the single source of truth for courses, units, widgets and search. Adding a page means adding it here too.
- Units live in `nursing-study-site/unit-N-<slug>/`, each with an `index.html` plus flashcard, quiz and study-guide pages.
- Shared code and styles are in `nursing-study-site/assets/` (`style.css`, `header.js`, `flashcards.js`, `practice-quiz.js`, `quiz.js`, `theme.js`, `unit-filter.js`). Pages load them with `?v=N` cache-busters. When you change a shared file, bump its `?v=` number on **every** page that loads it.
- Themes: light/dark plus pink/blue palettes, stored in `localStorage` (see the inline script in each page's `<head>`).

## Link previews (iMessage, GroupMe, etc.)

- Every page repeats the same meta block: `description`, `og:*` and `twitter:*`. The tagline, kept identical to the text in the image, is:
  `Flashcards, quizzes & study guides drafted from ATI & lecture material` (written with `&amp;` in HTML).
- `assets/og-image.png` is 1600×840 on a 44px grid. GroupMe draws its link bubble over roughly the top 37% of the image, so the title has to stay below about y=310. If you change the image, bump `og-image.png?v=N` on every page.
- Messaging apps cache previews per URL. To test a change, share a new URL such as `nursingschoolpinkprint.com/?v=2`.

## Content conventions

- Study guides are organized by week (`weekN-study-guide.html`) with mnemonics/memory hooks and quick checks. Material taken straight from lecture slides is tagged as slide content.
- Spell out every abbreviation the first time it appears on a page, in parentheses: `ADLs (activities of daily living)`. Mnemonics that are already spelled out letter by letter don't need it.
- Content is for adult clients. Leave out infant- and child-focused material (pediatric care, child specimen collection). Keep teen/adolescent content, passing mentions of infants or children, and infant or child rows in a table that covers every age group, so the table stays complete.
- Every topic quiz has exactly 40 questions. Keep `count` in `site-data.js` and the card/question counts on each unit `index.html` in sync.
- Quiz questions test the content, not where it came from. Never mark an answer wrong because it is "ATI only" or "not on the checklist"; every wrong option must be wrong on its own merits, and stems and rationales shouldn't cite the competency, slides, or ATI.
- Keep wording plain and accurate. Prefer dropping a forced mnemonic to keeping a confusing one.

## Reminders for next semester (NUR 121)

- **When work starts on sheet 02 (NUR 121), put the unit mastery bars back on the homepage** for tracked visitors. They were taken off in October 2026 only because NUR 114 was already halfway through, so bars on the early units looked odd and unfinished. The code to restore is the unit-card part of `home()` in `nursing-study-site/js/my-study.js` as of commit `c4c0a7d` (the thin `bar(st, {thin: true})` plus "% mastered →" in each card's `.pp-card-bottom`, opening `progress.html#unit-N`), and the `e2e-mystudy.js` check "homepage: mastery bars on units 1-3".

## Quiz data

- All quiz questions live in `nursing-study-site/data/nur114/unit-N.json`, one file per unit. Quiz pages hold no questions; they call `loadPracticeQuiz({data, units, topic})` from `practice-quiz.js`. Mix quizzes (`unit-N/mix-quiz.html`, `mix-all-quiz.html`) read the same files, so editing a question in the JSON updates every quiz that uses it.
- Each unit file has `topics` (topic name as shown on the unit page, `slug`, quiz page, `mixLabel` used for the Mix-all results, and `categories` in display order) and `questions`.
- Question IDs are `nur114-u{unit}-{topic-slug}-{NNN}`, e.g. `nur114-u3-safety-001`. **Never change or reuse an ID**, even when rewording a question. A new question gets the next unused number in its topic.
- `category` must match one of the topic's `categories` to show up in the "by category" results.
- `data/nur114/exams.json` holds the exam schedule and grading points. `data/nur114/index.json` lists which unit files exist; add a unit there when its JSON is added.
- Quizzes load their data with `fetch`, so test locally with a server (`python3 -m http.server` in `nursing-study-site/`), not by opening the file directly.

## Progress tracking

- The full plan is `design/TRACKING-PLAN.md` in the owner's design zip (with screens). Build in its phase order on the `tracking` branch (preview: https://tracking.nursingschoolprep.pages.dev/) and stop at each check-in. Where the plan conflicts with something already agreed with the owner, keep what was agreed.
- Tracking is on only when the device has a code saved (`js/tracking.js`: code, nickname, weekly goal, study feature switches; localStorage `pinkprint-tracking`). Guests: nothing is saved anywhere, and the site looks exactly as before apart from the locked "My study" box and menu row, and the "Start tracking" banner/button on guest quiz results.
- Progress (answers, mastery, journal, notes, bookmarks) is in `js/progress.js` (localStorage `pinkprint-progress`, keyed by question ID). `?today=YYYY-MM-DD` fakes the date on tracked devices for testing; `?today=off` undoes it.
- Pages: `start-tracking.html`, `settings.html`, `print-code.html` (QR + code, code passed in the `#` part), `link.html` (device linking, phase 4). Shared page controls in `js/tracking-ui.js`; QR library vendored at `assets/vendor/qrcode.js` (qrcode-generator 1.4.4, MIT).
- Data: `data/wordlist.json` (code words; never remove a word once codes exist), `data/nicknames.json` ("Miss Pinkprint" is reserved and never listed; the owner sets it with `#owner=<phrase>`, checked against `OWNER_HASH` in `js/tracking.js`; type `+` for spaces, or browsers treat the address as a search).
- Quiz pages keep their live layout; with tracking on they add the Bookmark button, "Check · I'm sure" / "Check · I guessed" (Enter / Shift+Enter), the "You were sure" / "You guessed" tag, "+ Add note" above "Next question", the Mastery box and Sure / Lucky guess / Blind spot review tags. Settings switches can turn off the Sure / Guessed tap and notes.
- Rules: blind spot = latest answer wrong while sure; lucky guess = latest answer right but guessed (still counts toward mastery). Priority: blind spot → mistake journal → bookmarked → mastered and due for review → lucky guess → never seen → still learning → mastered.
- My study (phase 5): `dashboard.html`, `exam.html`, `progress.html`, `journal.html`, `challenges.html` and `session.html` (`?mode=today|examready|weak|journal|bookmarks|blind|review|challenge|group`, plus `unit`/`topic`/`id`). Pure rules (dates, readiness 85/75 with fewer than 5 seen = not enough data, groups and ranking, today's plan, streaks where holiday break weeks (Thanksgiving, after the semester) count only through Settings' "Weekly goals during semester or holiday breaks" (`breaksOff` in settings; on by default): a hit grows the streak and a miss only pauses; turned off, break weeks are skipped, one busy week pass a month, grade points from `exams.json`, the countdown strip) are in `js/study.js`; the pages are drawn by `js/my-study.js`. The homepage shows the countdown strip (follows the Exam countdown switch) and highlights the current unit card (it keeps its Ready / In draft label), for tracked visitors only; no mastery bars there.
- Challenges (phase 6): `js/challenges.js` (page + API calls). Each challenge has a 4-character code (like `7KQ2`; the first ones had 8, which still work) that friends type in the "Join with a code" box; short links `/c/<ID>` are redirected by `_worker.js` to `challenges.html?join=<ID>`. Each challenge someone made or joined is saved in their synced settings (`challenges`: id, random ticket, mine/done/gone) and merged between devices by ID. Creating and joining need proof the nickname is yours (claim ticket, or the owner phrase for Miss Pinkprint, saved as `ownerProof` when `#owner=` is used). Topic quizzes show "Challenge a friend" for tracked students with the feature on. Group focus (challenges are for studying together; players are told before starting): once 2+ players finish, the card shows a one-line summary and finishers can open the Group focus page (`challenges.html?focus=<ID>`: weakest topics, most-missed questions with rationales, combined counts only, never who missed what) and "Quiz us on these" (`session.html?mode=group&id=<ID>`). Finishing saves right/wrong per question (`submit_answers` → `challenge_answers`, deleted with the challenge); older pages' `submit_score` still works. Spec: `design/TRACKING-PLAN.md` (additions to the plan in the design zip).
- Class tally (phase 6): `QuizTally` in `practice-quiz.js` sends every answer (guests too) as question ID + right/wrong only, in batches, to `/api/tally/add` → `increment_tally`. The worker drops IDs that aren't in the site's data.
- Stats page (phase 6): `stats.html` (noindex, linked from nowhere). Cloudflare Access (team `pinkprint.cloudflareaccess.com`, app "Pinkprint stats", email one-time code for the owner only) guards `/stats*` and `/api/stats/*` on nursingschoolpinkprint.com. `_worker.js` checks the Access token again (team and AUD constants at the top; not secrets) and calls `class_stats` with the Cloudflare secret `STATS_KEY`, whose hash the owner saves once with `select public.set_stats_key('<key>')` in the SQL Editor. On `*.pages.dev` the page loads but gets no data. Questions show after 5+ answers; warns at 5 or fewer free nicknames.
- Tests: `node tests/progress.test.js`, `node tests/tracking.test.js` and `node tests/study.test.js` from the repo root (Node 18+). Browser checks (`tests/sync/e2e-sync.js`, `tests/sync/e2e-mystudy.js`, `tests/sync/e2e-challenges.js`, `tests/sync/e2e-stats.js`; `servers.mjs` also stands in for Cloudflare Access) run against `tests/sync/servers.mjs`, a local stand-in for Supabase and Pages backed by a local Postgres with `supabase/setup.sql` loaded.
- Supabase (phase 4): `supabase/setup.sql` creates the tables and the only functions the site may call (run it in the Supabase SQL Editor; safe to re-run). `supabase/test.sql` checks it on a local Postgres. The site reaches Supabase only through `nursing-study-site/_worker.js` (Cloudflare Pages advanced mode; `_routes.json` limits it to `/api/*`), with the URL and publishable key stored as Cloudflare variables `SUPABASE_URL` / `SUPABASE_KEY`, never in the repo. `cloudflare/ping-worker.js` is the separate scheduled keep-alive Worker.
- Sync lives in `js/tracking.js`: PBKDF2 (600,000 rounds, separate salts) turns the code into a lookup ID and an AES-GCM key; progress, notes, nickname and settings are encrypted in the browser; saves use a version number and merge per question (newest change wins). Linking: `link.html` (typed code or QR `#code=`), Settings, and "Already have a code?" on Start tracking. Delete my data removes the saved copy, frees the nickname and clears the device; other devices clear on their next sync.
- `tests/sync/` is a two-device end-to-end test against a local Postgres running `setup.sql` (see the notes at the top of `servers.mjs`).
