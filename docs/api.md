# API and authoring contract

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

Descriptions accept strings or named variants selected by controller resolvers. Exceptional action effects and puzzle rules belong in JavaScript. Persisted data must be JSON-compatible; undefined values, functions, dates, accessors, cycles, non-finite numbers and unsafe object keys are rejected. Optional `schemaVersion` is 1; authoring syntax, package versions and save formats are independent.

For the field-by-field feature families, supported controller configuration, and behavioral limits, see the [feature reference](feature-reference.md). For adding actions or capabilities, see [Extending the platform](extending.md).

## Game and actions

`createGame(world, {seed})` clones the definition into independent `game.world` and mutable `game.state`. Treat `world` as read-only. The optional seed is a uint32. Construction validates topology, references, types and capabilities. Register rules, queries, events and any delayed predicates in the game factory. Call `game.validateWorld(game.state)` again after controller configuration to check any added runtime metadata and registered delayed references. Loading validates saved state before replacing the runtime.

`dispatch({type, actor:'player', target, secondaryTarget, ...})` is synchronous. Targets are IDs. Only player actor dispatch is supported. It returns `{action, status, success, messages, value, choices}`. `success` means the action committed, including an explicitly committed replacement; a free query such as `look` returns its value without a successful mutation. Message entries contain `{type:'message', args:[text,title,...]}` for rendering by the view.

Canonical types include `start`, `go`, `look`, `examine`, `examineClue`, `take`, `drop`, `open`, `close`, `lock`, `unlock`, `read`, `eat`, `search`, `wear`, `remove`, `enter`, `push`, `pull`, `climb`, `climbDown`, `turnOn`, `turnOff`, `press`, `putIn`, `putOn`, `useOn`, `connect`, `disconnect`, `wait`, `choose`, `chooseOption`, `tool`, `input`, `submitInput`, `record`, `enterText`, `acknowledgeMessage` and `acknowledgeEnding`. `removeFrom` aliases `take`; display-oriented action aliases are also accepted.

- `go.target`: destination room ID, connected from the current room.
- `unlock.target`: container/door; `secondaryTarget`: held matching key.
- Placement and `useOn`: primary object in `target`, destination in `secondaryTarget`.
- `examineClue.target`: `room-id:scenery-id`. Examines a feature authored in room `scenery`; the canonical runtime collection is `clues`.
- `choose`: named `choice` ID (or zero-based `index`).
- `tool`: named `option` ID and `secondaryTarget` (or a menu `index`).
- `chooseOption`: named `choice` and `option` IDs (or `choiceIndex` and `optionIndex`).
- `record`: zero-based `index`.
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
- `commit(advanceTime=true)`: commit a custom handler's mutation. Use `false` for a free mutation. An after rule may charge an otherwise free examination; duplicate commits never spend a second turn.

Controllers can use these generic helpers: `findItem` (item and owner location), `findItemInGameModel` (item alone), `getItemPropertyValue`, `moveItem`, `deleteItem`, `revealItem`, `createItemByEffect`, `setItemIdByEffect`, `performUpdateAction`, `awardAchievement`, `endGame`, `buildConditionalText`, `registerPredicate`, `startTimer`, `startMission` and `requestTransport`. These act on the current runtime; clients should use dispatch for player intentions. Methods beginning with `_` are internal and not a compatibility contract.

`registerPredicate(id, callback)` registers a synchronous boolean predicate used by delayed work. A timer's `waitUntil` or a transport request's `condition` can reference it as `{predicate:id}`. `testPredicate(reference)` checks it against current state; non-boolean results and unknown IDs throw. Use availability and before rules for immediate decisions. Register the same predicates and event listeners before loading saved work. Changing these IDs requires a game-owned save migration.

## Description resolvers

`game.describe(id, synchronousResolver)` registers one selector for a room ID, object ID or `roomID:clueID`. It returns an unsubscribe function. Register selectors during game initialization, including in runtimes that will load a save. Duplicate registrations, asynchronous handlers and recursive description queries are rejected. Registration may precede creation of a dynamic object.

```js
game.describe('study', ctx => ctx.state.player.dusk ? 'dusk' : 'default');
game.describe('study:mural', ctx => ctx.target.examined ? 'revealed' : 'default');
const text = game.getDescription('study');
```

The entity's `description` is a string, an array of `{id, text}` alternatives, or a map of variant names to strings. Alternatives require `default`. A resolver returns one existing variant ID or an ordered array of IDs to combine passages. `undefined` selects `default`; `[]` produces no text. Duplicate IDs, unknown IDs, non-string entries and other return types throw. Catalog order has no effect on selection order. Composition preserves authored spaces and the normal room/examination spacing behavior. Strings bypass the resolver; see [World descriptions](world-model.md#descriptions).

The resolver receives the ordinary context with `action.type: 'describe'`, the entity ID in `action.target`, the current entity in `target`, and its initial definition in `definition` when available. `room` is the player's current room, even when querying another room. `state`, `world` and `game` are available. Object capabilities use canonical `properties` paths. Always use the supplied current context rather than capturing mutable entity references across loads.

Resolvers are trusted synchronous functions, not sandboxed expressions. They should only read state and return an ID: do not mutate state, dispatch, emit, commit, schedule or consume randomness from a description resolver. Rendering can call them repeatedly. Selection itself does not advance time, cache prose or alter saves. Examination may independently mark a clue as examined before resolving its text.

`getDescription(id)` queries base text for a current room, live object or clue; unknown targets throw. It is not an accessibility check. Standard rendering adds its existing annotations and cues separately. A controller may deliberately replace a runtime `description` with plain text; this is saved state and bypasses its registered resolver. Prefer selectors for prose derived from facts so there is no second state value to synchronize.

## Events, turns and saves

`events.on(name,handler)` returns unsubscribe. `events.emit(name,data)` delivers synchronous FIFO events; emissions inside a handler queue behind the current listeners. A bounded drain rejects event cycles. Built-in facts include `itemMoved` (`item`, `fromRoom`, `toRoom`), `playerEnteredRoom` (`room`, `from`), `gameEnded` (`ending`) and `achievementEarned`. `stateCheck` and `checkEndings` allow story reactions at established turn boundaries.

`schedule.afterTurns(turns,name,jsonData)` returns a job ID; `schedule.cancel(id)` cancels it. Zero means next successful turn. Jobs, IDs and random seed live in saved runtime data. Re-register event listeners after constructing a runtime. Each turn advances transports, timers and missions in that order. A newly started timer has a one-update grace period.

`save()` returns a deep JSON copy with runtime `saveFormatVersion:1` and `worldSchemaVersion:1`. `load(saved)` validates and clones before replacing state, returns the game, and rejects another game's identity or unsupported future formats. Saves without explicit format metadata are interpreted as format 1 and validated. `state` references must be reacquired after load. Predicates/listeners are configuration and are registered anew, not saved. The package version is intentionally not used to reject saves.

Browser automatic save selection also checks the story's string `version`. Keep it stable for compatible prose/engine updates, or supply a story migration when changing it. Save migrations are owned by the game controller.

## Browser and build

`mountBrowser(factory,{worldUrl='./data/game.json',serviceWorkerUrl='./service-worker.js',autoStart=true,clockLabel='Elapsed time'})` returns a view. The factory receives fetched world data and must return a configured game. Room image refresh and preloading use the factory’s configured state, including controller-registered image queries. Default startup waits for window load, or schedules startup if load already completed; it does not replace `window.onload`. Use `autoStart:false` and `await view.start()` for explicit lifecycle control. `view.ready` exposes the startup promise once begun. Startup failures show a visible error; the promise completes after handling that error. One view mounts per document.

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


## Transport requests

`game.getTransport(id)` returns live transport state. `game.requestTransport({transport, destination, actor?, dwell?, condition?, event?, data?})` queues a request and returns whether it was accepted. The destination is a stop ID. For array-authored stops this is the room ID, never an array index. Requesting does not itself consume a turn; use it inside a dispatched, committed interaction. Transport advancement uses the engine's normal turn scheduler. Reacquire state references after loading.

The engine emits `transportDeparted` and `transportArrived` facts. Room-backed boarding spaces and automatic boarding connections are supported. See the [complete transport reference](feature-reference.md#transport) for defaults, events, NPC routes and validation.


## Entity-local prose

Named feedback can live on `room.prose`, `game.findItem(id).item.prose` or `game.getTransport(id).prose`. These are ordinary serializable dictionaries; the engine does not select a passage or infer behavior from its key. Controllers choose the message using state and read it from its owner. Object prose remains presentation data after normalization and follows the object through movement and save/load. Reacquire references after loading. A game-level catalog may still hold shared text.

### Action completion and availability

`HANDLED` means an instead rule handled the request; it does not itself mean the
attempt succeeded or spent a turn. Call `ctx.commit()` for a successful turn or
`ctx.commit(false)` for a successful action that costs no time. A handled refusal
can report text and return `HANDLED` without committing. After rules run for a
successful standard action, before world scheduling. An action commits at most
one turn; an after rule may charge an otherwise free examination with
`ctx.commit()`, for example when uncovering something takes time.

`game.available(type, match, predicate)` registers a synchronous, read-only
boolean predicate using the same matching forms as action rules. It filters
interaction menus and is rechecked when dispatching a request. Never mutate state,
consume randomness or emit events in an availability predicate. Menu queries do
not execute before/instead/after rules. The engine also enforces target scope
before running action rules.

For note discovery, `available('record', sourceID, predicate)` is also checked
by `canRecordNote` and message-popup note buttons. Notebook ownership, access,
open state and duplicate-note prevention remain standard engine semantics.

An `after('examine', ...)` or `after('examineClue', ...)` rule can adjust
`ctx.response.description` before the view receives the examination response.
Scenery examination targets use `room:scenery` IDs and resolve to the scenery
object in `ctx.target`. Persist any once-only discovery fact in state; the
response itself is temporary presentation data.


### Saved timer and transport continuations

Use events for delayed consequences. Event payloads must be JSON-compatible;
listeners are registered when constructing each game and are not saved.

```js
game.events.on('lanternGoesOut', ({item}) => {
  game.context().set(item, 'properties.lit', false);
});
game.after('turnOn', 'lantern', ctx => {
  ctx.game.startTimer({item: 'lantern', turns: 3,
    event: 'lanternGoesOut', data: {item: 'lantern'}});
});
```

`startTimer({item, turns, event, data?, justStarted?})` starts or replaces the
object's single countdown. Its remaining turns and payload survive saves. The
default `justStarted: true` skips the first timer update so the initiating action
does not immediately reduce the countdown. Use `false` for a continuation that
must count the next timer update. The timer is removed before its event fires.
For independent jobs or cancellation by job ID, use `schedule.afterTurns`.

A transport request's `event` fires upon servicing the request, including a
request for its current stop. A registered `condition` predicate, when supplied,
is checked before starting and before executing the arrival continuation. The
current request remains available during that event. `transportDeparted` runs
at departure; `transportArrived` follows the saved arrival continuation. Event listeners select any accompanying feedback from model-owned prose.

An ordinary transport button needs no action rule:

```js
pressable: {
  transport: 'ferry',
  stop: 'eastBank',
  message: 'You ring for the ferry.',
}
```

Pressing requests that stop and spends one turn. `dwell` optionally sets the
request's dwell duration; transport and stop references are validated on load.

### Actor mission facts

`missionStepStarted` carries `{actor, from, to, destination, phase}` immediately
before an actor moves along a mission route. Use it for story consequences of a
particular route step. `missionArrived` carries `{actor, destination, room,
variant}` after the arrival report. `variant` is a copy of the selected arrival
variant, or `null`. Event handlers receive the event payload, not an action
context; use `game.context()` when mutation helpers are useful.

### Room cues and observations

Room `cues` and `observations` can contain named `{id, text}` entries. Register
read-only `available('cue', ...)` predicates to choose when each is active:

```js
game.available('cue', {
  target: 'observatory',
  when: ctx => ctx.action.option === 'moonVisible',
}, ctx => ctx.game.findItem('shutters').item.properties.container.opened);
```

The query uses the room ID as `target` and the entry ID as `option`. It does not
run an action or advance time. Active cues appear in room reports. Observations
appear when their predicate changes from false to true during a turn's scheduled
world updates. Unrestricted entries are active by default. Register the same
predicates after creating a runtime that will load saved progress.

### Navigation and exit text

An exit's optional `door` is the ID of a live door object. The engine blocks
travel when it is locked, or when it is openable and closed. The door's
`lockedMessage` supplies custom blocking text. Declare the same reference on
both directions when both share that door; references are validated when
normalizing a world and loading a save.

`standingOn` optionally identifies a climbable object used as departure footing.
It permits that exit while standing on the object; other exits require climbing
down. The engine checks visibility and posture before action rules, for both
`go` and `enter`. A dispatched navigation request's `from` is set by the engine.

For exceptional travel restrictions, register `before` rules to report the
reason and read-only availability predicates to expose the same decision to
queries. Register for both `go` and `enter` when both verbs should be affected.
Nearby actor reports use traversable adjacency, including `go` availability
with the source room in `ctx.action.from`.

The existing availability registry also supports these presentation queries:

| Query type | `target` | Other fields | Purpose |
| --- | --- | --- | --- |
| `exit` | Source room ID | `option`: destination room ID | Whether the exit is visible |
| `exitVariant` | Source room ID | `secondaryTarget`: destination; `option`: variant ID | Whether a named exit-text alternative applies |

Exit text alternatives contain an `id` and presentation fields such as `before`,
`after` and `label`. The first allowed alternative supplies those fields;
otherwise the initial exit text applies. Read-only queries do not execute action
rules or spend turns. `getExitDisplayDefinition(exit, destinationName)` resolves
the source from the current model, including when inspecting another room.

`transportOpened` publishes `{transport, stop, actor}` when a same-stop request
opens previously closed boarding doors. It follows the request's continuation,
while the request remains available. Repeated requests for already open doors do
not publish another opening fact. Story listeners can add model-owned prose to
`state.player.turnObservations` as `{room, text}` entries without spending another
turn.

Mission queries also use the availability registry. `mission` has the actor ID in
`target` and destination ID in `option`; `startMission` checks it alongside route,
active-mission and completion constraints. `missionVariant` has the actor ID in
`target`, destination ID in `secondaryTarget` and named arrival alternative in
`option`. The first permitted variant supplies arrival prose and search duration.
Named variants need a nonempty unique `id` and positive `searchTurns`. Register
these read-only predicates in each game factory, including runtimes loading a
saved journey. `missionArrived.variant` retains the selected ID.

### Named report and text queries

Presentation selections share `game.available`; they do not dispatch player actions.

| Query | `target` | Other fields | Selection |
| --- | --- | --- | --- |
| `text` | Object or ending ID | `field`: `read`, `climb`, `movement`, `ending`, or `encounter`; `option`: segment ID | Include a named text segment |
| `image` | Room ID | `option`: image variant ID | Use the first available room image variant |
| `npcCue` | Actor ID | `option`: `movement` or `turn` | Publish and display that actor's report |
| `npcCueVariant` | Actor ID | `field`: `movement` or `turn`; `option`: variant ID | Select the first available report variant |

For example, a readable object can contain `text: [{id: 'sealed', text: 'The seal
is intact.'}, {id: 'opened', text: 'Meet at dusk.'}]`. Its controller selects the
appropriate passage without storing conditions in the object:

```js
game.available('text', {
  target: 'letter',
  when: ctx => ctx.action.field === 'read',
}, ctx => ctx.action.option === (ctx.target.properties.opened ? 'opened' : 'sealed'));
```

Plain string segments always appear. Unrestricted named segments also appear;
matching predicates must return booleans and must not change state. Selected
segments retain their established order. Standard climbing selects feedback
after setting posture, then commits its normal turn. Reading selects text before
its normal action consequences.

`game.buildConditionalText(text, separateSentences, {target, field})` renders a
named composition using these queries. `game.getEndingText(ending?)` returns the
selected ending paragraphs, defaulting to the current ending. Views should render
those paragraphs instead of interpreting the model themselves.

Actor reports retain their existing fresh-report priority, intermittent countdown
and saved random state. Saved reports contain their source and kind; display
queries recheck availability against current facts. Changing a receiver or
listener state therefore also affects reports restored from saves, without
consuming a turn or another random choice.
