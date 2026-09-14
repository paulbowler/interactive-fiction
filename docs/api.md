# V1 API and authoring contract

## Imports

```js
import { createGame, normaliseWorld, CONTINUE, STOP, HANDLED,
  ENGINE_VERSION, WORLD_SCHEMA_VERSION, SAVE_FORMAT_VERSION } from '@paulbowler/if-engine';
import { mountBrowser, BROWSER_VERSION } from '@paulbowler/if-browser';
```

No deep source imports are public. The engine has no DOM, Node or story dependency. The browser's `./build` export is Node-only; `./style.css` and `./template.html` expose presentation assets to other build tools.

## World authoring and runtime schema

Author worlds in JSON5 with flat capabilities, nested `items`, and `player.room`. Only `title`, `player.room` and `rooms` are required. IDs and references remain strings; capabilities use booleans. Defaults supply empty collections, initial timing and ordinary open/locked state. See the [world-model guide](world-model.md) for the complete contract and `examples/study/data/game.json5` for a runnable example.

`normaliseWorld(data)` clones and validates an authoring model into canonical runtime schema 1. `createGame` calls it automatically. Canonical world/state input is cloned unchanged; normalization is idempotent. Runtime objects use `properties`, containers use `properties.container.items`, doors use `properties.door`, and the player uses `currentRoom`. Ownership is the containing collection, with `findItem` providing a location query. No separate mutable location map is maintained.

Descriptions accept strings or named variants selected by controller resolvers. Existing conditional segment arrays are also supported. Exceptional action effects and puzzle rules belong in JavaScript. Persisted data must be JSON-compatible; undefined values, functions, dates, accessors, cycles, non-finite numbers and unsafe object keys are rejected. Optional `schemaVersion` is 1; authoring syntax, package versions and save formats are independent.

For the field-by-field feature families, supported controller configuration, and behavioral limits, see the [feature reference](feature-reference.md). For adding actions or capabilities, see [Extending the platform](extending.md).

## Game and actions

`createGame(world, {seed})` clones the definition into independent `game.world` and mutable `game.state`. Treat `world` as read-only. The optional seed is a uint32. Register story scripts, then call `game.validateWorld(game.state)` to validate the configured world and references. Authoring initialization checks basic topology, key references, types and capabilities. Full configured-world validation is explicit because story modules may register scripts after construction.

`dispatch({type, actor:'player', target, secondaryTarget, ...})` is synchronous. Targets are IDs. Only player actor dispatch is supported. It returns `{action, status, success, messages, value, choices}`. `success` means a committed standard action or a handled replacement; a free query such as `look` returns its value without a successful mutation. Message entries contain `{type:'message', args:[text,title,...]}` for rendering by the view.

Canonical types include `start`, `go`, `look`, `examine`, `examineClue`, `take`, `drop`, `open`, `close`, `lock`, `unlock`, `read`, `eat`, `search`, `wear`, `remove`, `enter`, `push`, `pull`, `climb`, `climbDown`, `turnOn`, `turnOff`, `press`, `putIn`, `putOn`, `useOn`, `connect`, `disconnect`, `wait`, `choose`, `chooseOption`, `tool`, `input`, `submitInput`, `record`, `enterText`, `acknowledgeMessage` and `acknowledgeEnding`. `removeFrom` aliases `take`; display-oriented action aliases are also accepted.

- `go.target`: destination room ID, connected from the current room.
- `unlock.target`: container/door; `secondaryTarget`: held matching key.
- Placement and `useOn`: primary object in `target`, destination in `secondaryTarget`.
- `examineClue.target`: `room-id:clue-id`.
- `choose`/`tool`/`record`: zero-based `index`.
- `chooseOption`: `choiceIndex` and `optionIndex`.
- `submitInput`: `value`; `enterText`: recorded note in `target`, input device in `secondaryTarget`.

Call `getAvailableActions(id)` and `getItemChoiceOptions(id,index)` for presentation. The dispatcher validates semantics independently of displayed options. Unsupported actions stop without mutation. `registerAction(type, synchronousHandler)` installs or overrides a standard handler and returns a restoration function. Nested dispatch is rejected; emit events for consequences instead.

## Rules and context

`before`, `instead`, `after`, and `report` accept `(actionType, match, handler)` or `(actionType, handler)`. The type may be `*`. A match may be a target ID, a predicate, or `{target,secondaryTarget,when}`. Rules run in registration order and return unsubscribe functions.

`CONTINUE` (also an omitted return) falls through; `STOP` stops processing; `HANDLED` replaces processing. Boolean returns are invalid. After rules run at a successful standard action's commit boundary, before turn consequences. Replaced actions do not run standard after rules. Report rules receive `ctx.result` and may adjust the result or report messages. Rules and handlers must be synchronous; they are trusted code, not transactional sandboxes, and exceptions do not roll back arbitrary mutations they made.

Context fields: `action`, actor ID, target/secondary objects, current room object, `world`, `state`, and `game`. Helpers:

- `say(text,title,...)`: report feedback.
- `set(itemID,'properties.someField',jsonValue)`: update an existing property path.
- `move(itemID,{type:'room',room:'study'})`: move to a room. Other destination types: `carried`, `worn`, or `container` with `item` ID.
- `emit(name,data)`: publish a fact.
- `commit(advanceTime=true)`: commit a custom handler's mutation. Use `false` for a free mutation. Do not commit again inside an after rule.

Advanced scripts can use these generic helpers: `findItem` (item and owner location), `findItemInGameModel` (item alone), `getItemPropertyValue`, `moveItem`, `deleteItem`, `revealItem`, `createItemByEffect`, `setItemIdByEffect`, `performUpdateAction`, `awardAchievement`, `endGame`, `evaluateCondition`, `buildConditionalText`, `registerScript`, `startTimer`, `startMission` and `requestTransport`. These act on the current runtime; clients should use dispatch for player intentions. Methods beginning with `_` are internal and not a compatibility contract.

Stable `registerScript(id,callback)` IDs allow configured interactions and saved timers to refer to story callbacks without serializing functions. The callback receives a context. Registered effect references use `{script:id}`; predicate references use `{predicate:id}`. Register the same scripts in every new runtime before loading. Changes to a story's script IDs require a story save migration.

## Description resolvers

`game.describe(id, synchronousResolver)` registers one selector for a room ID, object ID or `roomID:clueID`. It returns an unsubscribe function. Register selectors during game initialization, including in runtimes that will load a save. Duplicate registrations, asynchronous handlers and recursive description queries are rejected. Registration may precede creation of a dynamic object.

```js
game.describe('study', ctx => ctx.state.player.dusk ? 'dusk' : 'default');
game.describe('study:mural', ctx => ctx.target.examined ? 'revealed' : 'default');
const text = game.getDescription('study');
```

The entity's `description` is a string, an array of `{id, text}` alternatives, or a map of variant names to strings. Alternatives require `default`. A resolver returns one existing variant ID; `undefined` selects `default`. Unknown IDs and other return types throw. Strings bypass the resolver. Conditional segment arrays without variant IDs retain their concatenation behavior and also bypass it; see [World descriptions](world-model.md#descriptions).

The resolver receives the ordinary context with `action.type: 'describe'`, the entity ID in `action.target`, the current entity in `target`, and its initial definition in `definition` when available. `room` is the player's current room, even when querying another room. `state`, `world` and `game` are available. Object capabilities use canonical `properties` paths. Always use the supplied current context rather than capturing mutable entity references across loads.

Resolvers are trusted synchronous functions, not sandboxed expressions. They should only read state and return an ID: do not mutate state, dispatch, emit, commit, schedule or consume randomness from a description resolver. Rendering can call them repeatedly. Selection itself does not advance time, cache prose or alter saves. Examination may independently mark a clue as examined before resolving its text.

`getDescription(id)` queries base text for a current room, live object or clue; unknown targets throw. It is not an accessibility check. Standard rendering adds its existing annotations and cues separately. A controller may deliberately replace a runtime `description` with plain text; this is saved state and bypasses its registered resolver. Prefer selectors for prose derived from facts so there is no second state value to synchronize.

## Events, turns and saves

`events.on(name,handler)` returns unsubscribe. `events.emit(name,data)` delivers synchronous FIFO events; emissions inside a handler queue behind the current listeners. A bounded drain rejects event cycles. Built-in facts include `itemMoved` (`item`, `fromRoom`, `toRoom`), `playerEnteredRoom` (`room`) and `achievementEarned`. `stateCheck` and `checkEndings` allow story reactions at established turn boundaries.

`schedule.afterTurns(turns,name,jsonData)` returns a job ID; `schedule.cancel(id)` cancels it. Zero means next successful turn. Jobs, IDs and random seed live in saved runtime data. Re-register event listeners after constructing a runtime. Each turn advances transports, timers and missions in that order. A newly started timer has a one-update grace period.

`save()` returns a deep JSON copy with runtime `saveFormatVersion:1` and `worldSchemaVersion:1`. `load(saved)` validates and clones before replacing state, returns the game, and rejects another game's identity or unsupported future formats. Saves without explicit format metadata are interpreted as format 1 and validated. `state` references must be reacquired after load. Scripts/listeners are configuration and are registered anew, not saved. The package version is intentionally not used to reject saves.

Browser automatic save selection also checks the story's string `version`. Keep it stable for compatible prose/engine updates, or supply a story migration when changing it. Save migrations are owned by the game controller.

## Browser and build

`mountBrowser(factory,{worldUrl='./data/game.json',serviceWorkerUrl='./service-worker.js',autoStart=true,clockLabel='Elapsed time'})` returns a view. The factory receives fetched world data and must return a configured game. Default startup waits for window load, or schedules startup if load already completed; it does not replace `window.onload`. Use `autoStart:false` and `await view.start()` for explicit lifecycle control. `view.ready` exposes the startup promise once begun. Startup failures show a visible error; the promise completes after handling that error. One view mounts per document.

`view.game`, `initialModel`, `updateView`, `saveGameModel`, popup methods and image collection helpers support hosts and tests. Browser focus and animation state is presentation-only. Essential deferred movement resides in the game save and completes via `acknowledgeMessage`.

`if-build [if.config.json]` reads configuration:

```json
{
  "entry":"src/main.js",
  "world":"data/game.json5",
  "public":["data","assets"],
  "outDir":"dist"
}
```

`loadWorld(file)` from the Node-only `./build` export parses JSON5 and returns a normalized model, with file/path diagnostics on failure. The builder writes the configured world to the same relative path with a `.json` extension and omits its `.json5` source. The default browser URL remains `./data/game.json`.

Optional `template` and `styles` override defaults. Template placeholders are `{{title}}`, `{{release}}` and `{{entry}}`; `release` defaults to the world version. Keep the default template's DOM IDs for the standard view. The builder inserts the two package import mappings. Source imports must be relative ES modules or one of these two packages; this is a small copier/build tool, not an arbitrary npm bundler. Other bundlers can use the public entry points directly.

Images must be local, included in configured public directories. Output is a separate child directory, replaced only if empty or carrying a previous build marker. Builds are deterministic for identical inputs. `build-info.json` records selected versions; the worker revision hashes content, including every vendor module and asset. A complete successful precache is required before activation.
