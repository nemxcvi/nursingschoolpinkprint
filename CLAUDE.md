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
- Data: `data/wordlist.json` (code words; never remove a word once codes exist), `data/nicknames.json` ("Miss Pinkprint" is reserved and never listed; the owner sets it with `#owner=<phrase>`, checked against `OWNER_HASH` in `js/tracking.js`).
- Quiz pages keep their live layout; with tracking on they add the Bookmark button, "Check · I'm sure" / "Check · I guessed" (Enter / Shift+Enter), the "You were sure" / "You guessed" tag, "+ Add note" above "Next question", the Mastery box and Sure / Lucky guess / Blind spot review tags. Settings switches can turn off the Sure / Guessed tap and notes.
- Rules: blind spot = latest answer wrong while sure; lucky guess = latest answer right but guessed (still counts toward mastery). Priority: blind spot → mistake journal → bookmarked → mastered and due for review → lucky guess → never seen → still learning → mastered.
- Tests: `node tests/progress.test.js` and `node tests/tracking.test.js` from the repo root (Node 18+).
