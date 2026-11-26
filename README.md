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

- Recording a Goal, Corner or Foul, or awarding a Free Kick 10m, immediately
  stops the match clock. After the clock has been started for the first time,
  the next match-event button tap automatically resumes the clock while
  recording that event. If that next event is also a stoppage event, the clock
  resumes and immediately stops again at the event time.
