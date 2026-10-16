# Tracking plan: additions

The full tracking plan (`design/TRACKING-PLAN.md`, with screens) lives in the owner's design zip.
This file holds sections added after that zip was made. Copy them into the full plan when it is
next updated; where the two disagree, this file is newer.

---

## Phase 6 addition: Group focus (Challenges)

Challenges are meant for **studying together**: the page intro says so, and Group focus is how a
group sees what to review next.

### Sharing is opt-in

- Everyone who finishes a challenge is asked on its card: "Study this one together: share your
  answers…" with a **Share my answers** button. Nothing is counted until they choose to.
- Group focus counts **only the people who shared**, and shows **only to them** (sharing is what
  gets you in). It appears once **2 or more** are sharing. Before that, a sharer sees "You're
  sharing. Group focus appears here as soon as someone else shares too."
- The invite says plainly that with just two people sharing, each can tell which questions the
  other missed, and that you can stop sharing any time (**Stop sharing** on the card).
- People who haven't shared see the invite and how many others are sharing, but no results. The
  challenge's maker sees Group focus only if they took it and shared.

### What sharers see

Under the scores, a **Group focus** section ("N sharing · combined results only · Stop sharing"):

- **Topics, weakest first.** Each unit/topic in the challenge, ranked by the group's combined
  accuracy (right answers from everyone who finished ÷ questions × players). A topic with fewer
  than 3 questions in the challenge gets a small "Only N questions" label so nobody over-reads it.
  When a challenge mixes units, topics are labelled "Unit N · Topic".
- **Most missed.** Up to 5 questions, most missed first, each with "Missed by 4 of 6". Tapping one
  opens the correct answer(s) with their rationale (and the question's explanation if it has one).
  If nobody missed anything it says so.
- **Quiz us on these · N →** builds a session (`session.html?mode=group&id=<code>`) from every
  question at least one sharer missed, most missed first. It works like any My study session:
  answers count toward each person's own progress, mastery, journal and tally. It never changes
  challenge scores.

### Privacy rules

- Only combined numbers are ever shown or sent to the browser: per question, how many of the
  sharers missed it. Never who missed which question, never one player's answers.
- Only to people who shared, and only counting people who shared. Two sharers is allowed because
  both agreed after being told what it means.

### Storage

- New table `challenge_answers` (challenge, player's ticket hash, question ID, right/wrong). One
  row per question per player, saved once when they finish, only to build the group totals. It is
  saved for everyone who finishes but only counted once that player shares.
- New column `challenge_players.share_focus` (default off) and function
  `share_focus(id, ticket, share)`: a player who finished turns sharing on or off.
  No nickname, device or time is stored with it. Direct access is blocked like every other table.
- Rows are tied to the player row (`on delete cascade`), so they are deleted with the challenge:
  when its maker deletes it, or 7 days after it expires (the existing clean-up in `ping()` and
  `create_challenge`).
- New function `submit_answers(id, ticket, answers)`: takes one `{q, ok}` per challenge question
  (unanswered = wrong), checks every question belongs to the challenge exactly once, saves the
  answers and sets the score to the number right. `load_challenge` adds `share: {me, sharing}` for
  a player who finished, and `focus: {players, missed}` (sharers only) when they're sharing and 2+
  are.
- Older pages still call `submit_score`, which keeps working; those players just don't count
  toward Group focus and aren't asked to share. The site falls back to `submit_score` until the database update is run.

### Other Challenges page changes made with it

- New intro: "Challenges are for studying together…", plus four short points (Share, Compare,
  Group focus, Counts for you).
- Join moved into the New challenge box: a small underlined "Join a challenge with a code" under
  Create challenge opens the code box.
- Scores list in the order people finished (no ranking), each as `8/10` and `80%`.
- Challenges you've finished move under a **Finished** heading below the ones still to take.
- "expires in N days"; on the last day it reads **Last day to play** in red.
- The "Nobody has taken it yet" dashed note is smaller.
