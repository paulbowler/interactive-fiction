# V1 API and authoring contract

## Imports

```js
import { createGame, CONTINUE, STOP, HANDLED,
  ENGINE_VERSION, WORLD_SCHEMA_VERSION, SAVE_FORMAT_VERSION } from '@paulbowler/if-engine';
import { mountBrowser, BROWSER_VERSION } from '@paulbowler/if-browser';
```

No deep source imports are public. The engine has no DOM, Node or story dependency. The browser's `./build` export is Node-only; `./style.css` and `./template.html` expose presentation assets to other build tools.

## World schema 1

The schema preserves the original nested model rather than introducing an entity framework. Required top-level fields are `title`, string `version`, `rooms`, `items` (prototypes), `player`, `startScreen`, `achievements` and `endings`. A stable `id` is strongly recommended; older worlds fall back to their title. Optional `schemaVersion` defaults to 1. See the complete, runnable study world in `examples/study/data/game.json`.

Each room has a name, description, `exits` keyed by destination room ID, and `items` keyed by unique live object ID. Portable objects have `properties.portable: true`; fixed objects have `properties.fixed: true`. The player has a `currentRoom` and `carried`/`worn` object collections. `world.items` contains prototypes that scripts may instantiate later.

Containers use `properties.container` with `items`, `opened`, `openable`, `lockable`, `locked` and optional `key`. A supporter is a container with `supporter: true`, permanently `opened: true`, and no opening/locking capability. Nesting represents containment; an object's location is its owning collection. Doors use `properties.door`; exits can reference doors and generic blockers. Preserve these declarative relationships for graph inspection.

Descriptions may contain conditional prose. Generic conditions such as `itemState`, `hasItem`, `ownsItem`, `currentRoom`, `all`, `any` and `not` are data, not executable scripts. Exceptional action effects and puzzle rules belong in JavaScript. All persisted data must be JSON-compatible; undefined values, functions, dates, accessors, cycles, non-finite numbers and unsafe object keys are rejected.

## Game and actions

`createGame(world, {seed})` clones the definition into independent `game.world` and mutable `game.state`. Treat `world` as read-only. The optional seed is a uint32. Register story scripts, then call `game.validateWorld(game.state)` to validate the configured world and references. Initialization rejects non-JSON data and unsupported schema versions; full cross-reference validation is explicit because story modules may register scripts after construction.

`dispatch({type, actor:'player', target, secondaryTarget, ...})` is synchronous. Targets are IDs. Only player actor dispatch is supported. It returns `{action, status, success, messages, value, choices}`. `success` means a committed standard action or a handled replacement; a free query such as `look` returns its value without a successful mutation. Message entries contain `{type:'message', args:[text,title,...]}` for compatibility with the view.

Canonical types include `start`, `go`, `look`, `examine`, `examineClue`, `take`, `drop`, `open`, `close`, `lock`, `unlock`, `read`, `eat`, `search`, `wear`, `remove`, `enter`, `push`, `pull`, `climb`, `climbDown`, `turnOn`, `turnOff`, `press`, `putIn`, `putOn`, `useOn`, `connect`, `disconnect`, `wait`, `choose`, `chooseOption`, `tool`, `input`, `submitInput`, `record`, `enterText`, `acknowledgeMessage` and `acknowledgeEnding`. `removeFrom` aliases `take`; former UI action labels are also accepted.

- `go.target`: destination room ID, connected from the current room.
- `unlock.target`: container/door; `secondaryTarget`: held matching key.
- Placement and `useOn`: primary object in `target`, destination in `secondaryTarget`.
- `examineClue.target`: `room-id:clue-id`.
- `choose`/`tool`/`record`: zero-based `index`.
- `chooseOption`: `choiceIndex` and `optionIndex`.
- `submitInput`: `value`; `enterText`: target requiring input plus recorded note in `secondaryTarget`.

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

For advanced scripts, v1 retains the generic helpers used during migration: `findItem` (item and owner location), `findItemInGameModel` (item alone), `getItemPropertyValue`, `moveItem`, `deleteItem`, `revealItem`, `createItemByEffect`, `setItemIdByEffect`, `performUpdateAction`, `awardAchievement`, `endGame`, `evaluateCondition`, `buildConditionalText`, `registerScript`, `startTimer`, `startMission` and `requestTransport`. These act on the current runtime; direct action methods are retained for compatibility but clients should use dispatch. Methods beginning with `_` are internal and not a compatibility contract.

Stable `registerScript(id,callback)` IDs allow configured interactions and saved timers to refer to story callbacks without serializing functions. The callback receives a context. Registered effect references use `{script:id}`; predicate references use `{predicate:id}`. Register the same scripts in every new runtime before loading. Changes to a story's script IDs require a story save migration.

## Events, turns and saves

`events.on(name,handler)` returns unsubscribe. `events.emit(name,data)` delivers synchronous FIFO events; emissions inside a handler queue behind the current listeners. A bounded drain rejects event cycles. Built-in facts include `itemMoved` (`item`, `fromRoom`, `toRoom`), `playerEnteredRoom` (`room`) and `achievementEarned`. `stateCheck` and `checkEndings` allow story reactions at established turn boundaries.

`schedule.afterTurns(turns,name,jsonData)` returns a job ID; `schedule.cancel(id)` cancels it. Zero means next successful turn. Jobs, IDs and random seed live in saved runtime data. Re-register event listeners after constructing a runtime. Existing generic transport, timer and mission state machines preserve their original order and timer-start grace.

`save()` returns a deep JSON copy with runtime `saveFormatVersion:1` and `worldSchemaVersion:1`. `load(saved)` validates and clones before replacing state, returns the game, and rejects another game's identity or unsupported future formats. Legacy saves without format metadata are accepted when structurally valid. `state` references must be reacquired after load. Scripts/listeners are configuration and are registered anew, not saved. The package version is intentionally not used to reject saves.

Browser automatic save selection also checks the story's string `version`. Keep it stable for compatible prose/engine updates, or supply a story migration when changing it. The King's Diamond owns its legacy-effect migration outside this engine.

## Browser and build

`mountBrowser(factory,{worldUrl='./data/game.json',serviceWorkerUrl='./service-worker.js',autoStart=true,clockLabel='Elapsed time'})` returns a view. The factory receives fetched world data and must return a configured game. Default startup waits for window load, or schedules startup if load already completed; it does not replace `window.onload`. Use `autoStart:false` and `await view.start()` for explicit lifecycle control. `view.ready` exposes the startup promise once begun. Startup failures show a visible error; the promise completes after handling that error. One view mounts per document.

`view.game`, `initialModel`, `updateView`, `saveGameModel`, popup methods and image collection helpers support hosts and tests. Browser focus and animation state is presentation-only. Essential deferred movement resides in the game save and completes via `acknowledgeMessage`.

`if-build [if.config.json]` reads configuration:

```json
{
  "entry":"src/main.js",
  "world":"data/game.json",
  "public":["data","assets"],
  "outDir":"dist"
}
```

Optional `template` and `styles` override defaults. Template placeholders are `{{title}}`, `{{release}}` and `{{entry}}`; `release` defaults to the world version. Keep the default template's DOM IDs for the standard view. The builder inserts the two package import mappings. Source imports must be relative ES modules or one of these two packages; this is a small copier/build tool, not an arbitrary npm bundler. Other bundlers can use the public entry points directly.

Images must be local, included in configured public directories. Output is a separate child directory, replaced only if empty or carrying a previous build marker. Builds are deterministic for identical inputs. `build-info.json` records selected versions; the worker revision hashes content, including every vendor module and asset. A complete successful precache is required before activation.
