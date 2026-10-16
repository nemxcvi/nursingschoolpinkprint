# Tracking plan: additions

The full tracking plan (`design/TRACKING-PLAN.md`, with screens) lives in the owner's design zip.
This file holds sections added after that zip was made. Copy them into the full plan when it is
next updated; where the two disagree, this file is newer.

---

## Phase 6 addition: Group focus (Challenges)

### What students see

Once **3 or more players have finished** a challenge, its card on the Challenges page shows a
**Group focus** section, under the scores, to everyone who can see the scores (players who have
finished, and the person who made it):

- **Topics, weakest first.** Each unit/topic in the challenge, ranked by the group's combined
  accuracy (right answers from everyone who finished ÷ questions × players). A topic with fewer
  than 3 questions in the challenge gets a small "Only N questions" label so nobody over-reads it.
  When a challenge mixes units, topics are labelled "Unit N · Topic".
- **Most missed.** Up to 5 questions, most missed first, each with "Missed by 4 of 6". Tapping one
  opens the correct answer(s) with their rationale (and the question's explanation if it has one).
  If nobody missed anything it says so.
- **Quiz us on these · N →** builds a session (`session.html?mode=group&id=<code>`) from every
  question at least one finisher missed, most missed first. It works like any My study session:
  answers count toward each person's own progress, mastery, journal and tally. It never changes
  challenge scores.

### Privacy rules

- Only combined numbers are ever shown or sent to the browser: per question, how many of the
  finishers missed it. Never who missed which question, never one player's answers.
- Group focus stays hidden until 3 players have finished with their answers saved, so a pair of
  friends can't work out each other's answers.
- Outsiders (people who haven't finished and didn't make the challenge) get no Group focus, same
  as scores.

### Storage

- New table `challenge_answers` (challenge, player's ticket hash, question ID, right/wrong). One
  row per question per player, saved once when they finish, only to build the group totals.
  No nickname, device or time is stored with it. Direct access is blocked like every other table.
- Rows are tied to the player row (`on delete cascade`), so they are deleted with the challenge:
  when its maker deletes it, or 7 days after it expires (the existing clean-up in `ping()` and
  `create_challenge`).
- New function `submit_answers(id, ticket, answers)`: takes one `{q, ok}` per challenge question
  (unanswered = wrong), checks every question belongs to the challenge exactly once, saves the
  answers and sets the score to the number right. `load_challenge` adds `focus: {players, missed}`
  when allowed.
- Older pages still call `submit_score`, which keeps working; those players just don't count
  toward Group focus. The site falls back to `submit_score` until the database update is run.

### Other Challenges page changes made with it

- New intro: what challenges are, plus four short points (Share, Compare, Group focus, Counts for
  you).
- Scores list in the order people finished (no ranking), each as `8/10` and `80%`.
- Challenges you've finished move under a **Finished** heading below the ones still to take.
- "expires in N days"; on the last day it reads **Last day to play** in red.
- The "Nobody has taken it yet" dashed note is smaller.
