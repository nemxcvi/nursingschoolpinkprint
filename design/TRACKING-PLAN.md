# Tracking plan: additions

The full tracking plan (`design/TRACKING-PLAN.md`, with screens) lives in the owner's design zip.
This file holds sections added after that zip was made. Copy them into the full plan when it is
next updated; where the two disagree, this file is newer.

---

## Phase 6 addition: Group focus (Challenges)

Challenges are meant for **studying together**: the page intro says so, and Group focus is how a
group sees what to review next.

### Sharing is opt-in, chosen before starting

- When someone starts a challenge for the first time, a **Before you start: Study this one
  together?** box comes first, with **Share my answers** and **Just my score**. It explains that
  only combined numbers are shown, only to people who share, and that with just two people
  sharing each could tell which questions the other missed.
- The choice is made **before seeing any questions** and is **locked once they finish** (both
  ways), so nobody decides after seeing their score. Choosing after would skew the group's
  numbers, since people who did badly would be more likely to opt out.
- Group focus counts **only people who shared and finished**, and shows **only to them**, once
  **2 or more** have.

### On the challenge card

Under the scores, a short **Group focus** line, so the list stays tidy:

- Shared, and 2+ sharers finished: "N sharing · combined results only" and "Weakest: Topic ·
  50% right · 6 questions someone missed", with a **See Group focus →** button.
- Shared, waiting: "You're sharing. Group focus opens once someone else who shares finishes too."
- Didn't share: "You took this one without sharing your answers, so Group focus isn't available
  for it."

### The Group focus page (`challenges.html?focus=<code>`)

"← Challenges", the challenge title, "From the N people who shared their answers. Combined results
only, never who missed what.", then:

- **Quiz us on these · N →** builds a session (`session.html?mode=group&id=<code>`) from every
  question at least one sharer missed, most missed first. It works like any My study session:
  answers count toward each person's own progress, mastery, journal and tally. It never changes
  challenge scores.
- **Topics, weakest first.** Each unit/topic in the challenge, ranked by the group's combined
  accuracy (right answers from everyone sharing ÷ questions × sharers). A topic with fewer
  than 3 questions in the challenge gets a small "Only N questions" label so nobody over-reads it.
  When a challenge mixes units, topics are labelled "Unit N · Topic".
- **Most missed.** Up to 10 questions, most missed first, each with "Missed by 2 of 3". Tapping
  one opens the correct answer(s) with their rationale (and the question's explanation if it has
  one). If nobody missed anything it says so.
- Anyone else who opens the link sees "Not available" with the reason.

### Privacy rules

- Only combined numbers are ever shown or sent to the browser: per question, how many of the
  sharers missed it. Never who missed which question, never one player's answers.
- Only to people who shared, and only counting people who shared. Two sharers is allowed because
  both agreed after being told what it means.

### Storage

- New table `challenge_answers` (challenge, player's ticket hash, question ID, right/wrong). One
  row per question per player, saved once when they finish, only to build the group totals. It is
  saved for everyone who finishes but only counted once that player shares. No nickname, device
  or time is stored with it. Direct access is blocked like every other table.
- New column `challenge_players.share_focus` (default off) and function
  `share_focus(id, ticket, share)`: a player who joined sets it before finishing; refused after.
- Rows are tied to the player row (`on delete cascade`), so they are deleted with the challenge:
  when its maker deletes it, or 7 days after it expires (the existing clean-up in `ping()` and
  `create_challenge`).
- New function `submit_answers(id, ticket, answers)`: takes one `{q, ok}` per challenge question
  (unanswered = wrong), checks every question belongs to the challenge exactly once, saves the
  answers and sets the score to the number right. `load_challenge` adds `share: {me, sharing}` for
  any player, and `focus: {players, missed}` (finished sharers only) when they're sharing,
  finished, and 2+ sharers have finished.
- Older pages still call `submit_score`, which keeps working; those players just don't count
  toward Group focus and aren't asked to share. The site falls back to `submit_score` until
  the database update is run.

### Other Challenges page changes made with it

- New intro: "Challenges are for studying together: everyone answers the same questions, then
  you see what the group should review.", then four numbered steps in one boxed row (two by two on
  phones): Make one, Send it, Compare, Study together.
- Join moved into the New challenge box: a small underlined "Join a challenge with a code" under
  Create challenge opens the code box.
- Scores list in the order people finished (no ranking), each as `8/10` and `80%`.
- Challenges you've finished move under a **Finished** heading below the ones still to take.
- "expires in N days"; on the last day it reads **Last day to play** in red.
- The "Nobody has taken it yet" dashed note is smaller.
