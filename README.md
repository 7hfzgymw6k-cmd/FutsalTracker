# FutsalTracker

The interface uses a consistent dependency-free SVG line-icon system that
inherits the application theme and remains available offline.

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
