# Tracking plan: additions

The full tracking plan (`design/TRACKING-PLAN.md`, with screens) lives in the owner's design zip.
This file holds sections added after that zip was made. Copy them into the full plan when it is
next updated; where the two disagree, this file is newer.

---

## Phase 6 addition: Group focus (Challenges)

Challenges are meant for **studying together**: the page intro says so, and Group focus is how a
group sees what to review next.

### Everyone who finishes counts

Challenges are only for people who want to study together, so there's no opt-out: everyone who
finishes is part of Group focus.

- When someone starts a challenge for the first time, a **Before you start: This challenge is for
  studying together** box comes first. It says that answers are combined into Group focus, that
  only combined numbers are shown (never who missed what) and only to people who finished, and
  that with just two people each could tell which questions the other missed. **Start challenge →**
  begins it.
- Group focus counts everyone who finished with their answers saved, and shows only to them, once
  **2 or more** have finished.

### On the challenge card

Under the scores, a short **Group focus** line, so the list stays tidy:

- 2+ finished: "N finished · combined results only" and "Weakest: Topic · 50% right · 6
  questions someone missed", with a **See Group focus →** button.
- Only you so far: "Group focus opens once someone else finishes too."

### The Group focus page (`challenges.html?focus=<code>`)

"← Challenges", the challenge title, "From the N people who finished. Combined results
only, never who missed what.", then:

- **Quiz us on these · N →** builds a session (`session.html?mode=group&id=<code>`) from every
  question at least one finisher missed, most missed first. It works like any My study session:
  answers count toward each person's own progress, mastery, journal and tally. It never changes
  challenge scores.
- **Topics, weakest first.** Each unit/topic in the challenge, ranked by the group's combined
  accuracy (right answers from everyone who finished ÷ questions × finishers). A topic with fewer
  than 3 questions in the challenge gets a small "Only N questions" label so nobody over-reads it.
  When a challenge mixes units, topics are labelled "Unit N · Topic".
- **Most missed.** Up to 10 questions, most missed first, each with "Missed by 2 of 3". Tapping
  one opens the correct answer(s) with their rationale (and the question's explanation if it has
  one). If nobody missed anything it says so.
- Anyone who hasn't finished sees "Not available" with the reason.

### Privacy rules

- Only combined numbers are ever shown or sent to the browser: per question, how many of the
  finishers missed it. Never who missed which question, never one player's answers.
- Only to people who finished. Everyone is told before starting, including what it means with
  just two people.

### Storage

- New table `challenge_answers` (challenge, player's ticket hash, question ID, right/wrong). One
  row per question per player, saved once when they finish, only to build the group totals. It is
  saved for everyone who finishes. No nickname, device
  or time is stored with it. Direct access is blocked like every other table.
- `challenge_players.share_focus` and `share_focus(...)` are left over from a preview where sharing
  was optional. The site no longer uses them.
- Rows are tied to the player row (`on delete cascade`), so they are deleted with the challenge:
  when its maker deletes it, or 7 days after it expires (the existing clean-up in `ping()` and
  `create_challenge`).
- New function `submit_answers(id, ticket, answers)`: takes one `{q, ok}` per challenge question
  (unanswered = wrong), checks every question belongs to the challenge exactly once, saves the
  answers and sets the score to the number right. `load_challenge` adds `focus: {players, missed}` for
  a player who finished, once 2+ have.
- Older pages still call `submit_score`, which keeps working; those players just don't count
  toward Group focus. The site falls back to `submit_score` until
  the database update is run.

### Other Challenges page changes made with it

- New intro: "Challenges are for studying together: everyone answers the same set of
  questions.", then four numbered steps in one boxed row (two by two on phones): Create, Send
  (expires in 7 days), Study (Group focus shows which units or topics the group should review), Progress (answers
  count toward your own progress).
- New challenge: **All units** is an option under Unit (questions drawn from every unit that has
  them; no topic choice). Group focus then labels topics "Unit N · Topic".
- Join moved into the New challenge box: a small underlined "Join a challenge with a code" under
  Create challenge opens the code box.
- Scores list in the order people finished (no ranking), each as `8/10` and `80%`.
- Challenges you've finished move under a **Finished** heading below the ones still to take.
- "expires in N days"; on the last day it reads **Last day to play** in red.
- The "Nobody has taken it yet" dashed note is smaller.
