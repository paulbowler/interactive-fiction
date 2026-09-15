# Game-authoring guide for agents

## Working objective

Create or maintain an independent game that consumes released platform packages. A game provides a declarative world, prose/assets and a JavaScript controller registering exceptional rules. Do not copy engine source into the game or modify `node_modules`.

Start from `examples/study`. Read `docs/tutorial.md`, `docs/feature-reference.md`, `docs/extending.md`, `docs/api.md` and the target game's existing rules/tests before changing mechanics. An existing playable game is the behavioral reference; preserve its IDs, meaningful state transitions, timings, prose and assets unless the task requests a change.

## Project contract

- Dependencies: pinned `@paulbowler/if-engine` and `@paulbowler/if-browser` release archives, with a committed lockfile. Prefer the versions already selected by the project.
- `data/game.json5`: compact declarative world, starting state, topology, capabilities and prose. No executable JavaScript or embedded effect programs.
- `src/story.js` or `src/logic/*.js`: explicit `register(game)` functions for exceptional rules and world reactions.
- `src/main.js`: creates the engine, registers all controller modules and mounts the view.
- `if.config.json`: names the source entry, world and public asset directories.
- `dist/`: generated standalone deployment, never the source of truth.

Author flat capabilities (`portable: true`, `container: true`) and nested `items`; use `player.room` for the starting room. Do not add a `properties` wrapper or redundant empty collections. IDs used as values remain quoted strings. Read [world-model.md](world-model.md) for defaults, implications and validation. Runtime inventory is `state.player.carried` and `state.player.worn`; runtime containers use `properties.container.items`. Use `findItem` to query ownership, rather than adding competing location fields.

## Decide where behavior belongs

Use model properties for ordinary portability, fixed objects, containers, keys, doors and room connections. The engine already implements these semantics. Use rules for unusual restrictions or consequences. A view formats and dispatches intentions; it must not decide story outcomes.

Keep changing prose under one `description` field: use a string for ordinary text, or named `{id, text}` alternatives with `default`. Register `game.describe(id, ctx => variantID)` in the controller. Return an ordered array of variant IDs when several passages must be combined; never use catalog array positions as selectors. Keep selectors synchronous and free of mutations; test each meaningful state and save/load. See [Descriptions](world-model.md#descriptions).

Use `before` to block or prepare an attempt, `instead` to replace it, and `after` for consequences of a successful standard action. Return `STOP`, `HANDLED` or `CONTINUE`/undefined; never overloaded booleans. A custom replacement that mutates state must call `ctx.commit()` (or `ctx.commit(false)` for a free mutation). Do not commit again inside an after rule.

Actions are attempts; events are facts. Emit a named event for a consequence and use `schedule.afterTurns` for delayed reactions. Keep event chains bounded. Handlers are synchronous and must not dispatch another player action recursively. Small local state machines belong in ordinary serializable state; do not introduce a framework for a few phases.

## State and saves

Store essential progress in `game.state`. Register callbacks and event handlers for every runtime before restoring a save. Do not store progress in closures, DOM elements, dates, timers, promises or functions. Use `game.save()` and a newly configured runtime's `load()` to test restoration.

Keep game identity stable. Engine package version, story version, schema version and save format are separate. Do not change the story's version simply because an engine patch is installed. If changing predicate/event IDs or incompatible puzzle state, implement and test a story-owned save migration instead of silently deleting progress.

## Verification

For a new puzzle, add a short programmatic action replay covering the successful path, relevant blocked actions, repeat interactions and save/reload at a meaningful boundary. Assert resulting state and time, not only returned messages. Do not create tests that merely restate a function's implementation.

Use `game.dispatch` for attempted player actions. Direct mutation is acceptable to arrange isolated test fixtures, but label it clearly; do not call such a fixture a complete playable walkthrough. At least one winning route should run entirely through dispatched actions or UI controls.

Run the game's test command, build it, and inspect the browser interface. Check relative asset paths and offline loading when changing build/deployment behavior. A complete game should document controls, winning/failure conditions, how to run its tests and how to deploy `dist/`.

Before an engine dependency upgrade, preserve the existing lockfile/replay baseline. Install the selected release, run the unchanged regressions first, investigate differences, then build and deploy the complete output. Do not suppress a regression merely to make the upgrade pass.

## Suggested task prompt

> Create a standalone game using the released Interactive Fiction platform. Start from the study template. Keep the engine as a dependency, ordinary world structure in JSON5, exceptional behavior in registered JavaScript rules, and all runtime progress serializable. Implement the requested story, a meaningful action replay, save/restore coverage and a standalone build. Preserve the platform's existing action semantics and document any intentional deviations.

When handing off, provide the project path, build/run commands, tests actually run, the selected engine release and any remaining limitations. Distinguish a built local site from a publicly deployed one.
