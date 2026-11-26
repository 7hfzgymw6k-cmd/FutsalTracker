# FutsalTracker

The interface uses a consistent dependency-free SVG line-icon system that
inherits the application theme and remains available offline.

## Help

- The `?` button opens an in-app guide to match setup, clock stoppages,
  possession changes, passes, accumulated fouls, summaries and offline use.

## Anonymous user counter

- The start screen shows an approximate unique-user count supplied by
  CounterAPI. No team names or match statistics are sent to the counter.
- The last successful count is cached locally. Match tracking remains fully
  available when the network or counter service is unavailable, and the count
  refreshes the next time the app is online.
- Local development reads the counter without incrementing it.

## Team names

- Home and away team names are limited to 12 characters. The limit is enforced
  for new input, restored local matches, and incoming shared match links.

## Passes before each goal

- Every Goal records the scoring team's successful pass-sequence length
  immediately before the goal. The match summary shows the score progression
  for every goal, for example `2–1 (6 passes)`. The same goal progression is
  included in shared text and interactive match links.

## Goals and total shots

- Whole-match, first-half and second-half summary cards compare Goals against
  Total Shots for each team and show the resulting conversion percentage.
  Goals are included in Total Shots. Shared-text summaries include the same
  comparison.

## Score background behavior

- The score area normally shows the color of the team in possession. After a
  Goal, it switches to the scoring team's color and keeps that highlight
  through the resulting clock stoppage. The next recorded match event returns
  the score background to the normal possession indication.

## Clock stoppage behavior

- Recording a Goal, Corner, Kick-in or Foul, or awarding a Free Kick 10m, immediately
  stops the match clock. After the clock has been started for the first time,
  the next match-event button tap automatically resumes the clock while
  recording that event. If that next event is also a stoppage event, the clock
  resumes and immediately stops again at the event time.

## Kick-ins

- When the ball goes out of court, tap Kick-in for the team awarded the
  kick-in. It behaves like a Corner: the event is recorded, the clock stops,
  and the next event tap resumes it.
- Kick-ins are included in the live counters, event log, first-half and
  second-half statistics, whole-match statistics, shared text, and interactive
  match links.

## Combined score and clock

- The live score and clock share one compact panel. The home and away team
  names appear to the left and right of the clock, and the score remains
  centered below them.
- Team names are not repeated above the event-button columns. Their left/right
  positions and team colors identify the corresponding controls.
- The clock always has a white background and does not change color with
  possession.
- Possession is communicated by the panel background color without a separate
  text indicator.
