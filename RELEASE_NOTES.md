# Interactive Fiction v2.0.0

A reusable headless fiction engine and browser view, with compact JSON5 worlds,
standard actions, explicit story rules, deterministic events and saved delayed work.

This is a major API release. Use before/instead/after rules for exceptional actions,
read-only availability queries for presentation, and event listeners for consequences.
The engine does not execute action/effect records or condition expressions.
`registerPredicate` supplies named boolean checks for queued transport requests and
timers; event names and serializable payloads identify delayed reactions.

Transport entities belong in the model's `transports` collection. Their stops,
boarding space and connections remain inspectable independently of controls.
Named descriptions and entity-owned prose keep displayed text in the world model.

See the [tutorial](docs/tutorial.md), [model reference](docs/world-model.md),
[feature reference](docs/feature-reference.md) and [API](docs/api.md).
Register game rules, predicates and listeners before loading saved progress.
Games own conversions for state that contains executable records or changed IDs.
World schema and save envelope remain version 1; the package version is independent.

```sh
npm install --save-exact --allow-remote=root https://github.com/paulbowler/interactive-fiction/releases/download/v2.0.0/paulbowler-if-engine-2.0.0.tgz https://github.com/paulbowler/interactive-fiction/releases/download/v2.0.0/paulbowler-if-browser-2.0.0.tgz
```

The engine and browser are MIT licensed. Games keep their own content licenses.
