# Interactive Fiction v3.0.0

Scenery uses the same terminology throughout the model, runtime, rules and browser.

- Use `examineScenery`, `getRoomScenery`, and `showSceneryModal`.
- Room features remain in `room.scenery` at runtime.
- Inline links expose `sceneryKey`; scenery link targets use `type: 'scenery'` and `scenery`.
- World schema version is 2; the save envelope remains version 1.
- Update both engine and browser packages together. Previous scenery API names and world schema 1 saves are not supported.

Examination, discovery rules, room-local IDs and named prose retain their behaviour.
