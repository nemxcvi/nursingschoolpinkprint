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
- Keep wording plain and accurate. Prefer dropping a forced mnemonic to keeping a confusing one.
