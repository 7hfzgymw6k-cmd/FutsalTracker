# FutsalTracker

The interface uses a consistent dependency-free SVG line-icon system that
inherits the application theme and remains available offline.

## Clock stoppage behavior

- Recording a Goal, Corner or Foul, or awarding a Free Kick 10m, immediately
  stops the match clock. After the clock has been started for the first time,
  the next match-event button tap automatically resumes the clock while
  recording that event. If that next event is also a stoppage event, the clock
  resumes and immediately stops again at the event time.
