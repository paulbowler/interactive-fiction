# Interactive Fiction v3.2.1

Configure the game clock and an optional failure deadline directly in game JSON.

- `clock.startTime` sets the initial 24-hour time, for example `"23:00"`.
- `clock.deadline: {"time": "05:00", "ending": "out-of-time"}` triggers an existing ending when the next 05:00 is reached or passed. A deadline requires `startTime`.
- The display wraps at midnight; timers and notices continue to use elapsed minutes.
- Deadlines run before normal ending checks and scheduled world updates. Already completed endings remain final.
- Browser clocks, save slots, and ending screens display the configured time; saved games retain progress.
- Both settings are optional. World schema 2 and save format 1 are unchanged.

See [Clock and delayed events](https://github.com/paulbowler/interactive-fiction/blob/v3.2.1/docs/feature-reference.md#clock-and-delayed-events) for examples and deadline semantics.
