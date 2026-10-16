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

## Progress tracking (testing only)

- All progress code is in `nursing-study-site/js/progress.js` (loaded on every page). It does nothing unless localStorage `pinkprint-track` is `on`: visit any page with `?track=on` / `?track=off`. `?today=YYYY-MM-DD` fakes the date, `?today=off` undoes it.
- Progress is stored in localStorage `pinkprint-progress`, keyed by question ID. With the flag off, pages must look and behave exactly as before.
- The approved tracking designs are in the design zip's `design/` folder (README + screens). Quiz pages keep their live layout; with tracking on they only add the Bookmark button, the "My note" box, the Mastery box on results and the "Blind spot" review tag. Smart session (`Progress.pick`) has no button on quiz pages; it starts from My dashboard in a later phase.
- Rule tests: `node tests/progress.test.js` from the repo root (Node 18+).
