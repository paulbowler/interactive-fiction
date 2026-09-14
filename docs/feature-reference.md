# Model and controller feature reference

This reference covers the built-in feature families in platform 1.4. Read [World authoring](world-model.md) for JSON5 syntax, defaults, IDs and containment, and [API](api.md) for dispatch, rule registration, events, saves and browser setup.

**Authoring fields** below belong in JSON5. Object fields are flat unless a structured capability is shown. **Controller configuration** belongs in JavaScript, after `createGame`: it uses runtime `properties` paths and registered script IDs. Do not embed action/effect programs or callbacks in the world file. Configuration and progress must remain serializable.

## Coverage map

| Feature | Reference |
| --- | --- |
| Identity, prototypes, starting inventory, normalization, validation | [World authoring](world-model.md) |
| Start screen, rooms, images, prose, scenery | [Presentation](#presentation-and-discovery) |
| Navigation, passages, doors, blockers | [Navigation](#navigation-and-blockers) |
| Scenery, hidden objects, portability, reachability | [Object flags](#object-flags-and-inventory) |
| Containers, supporters, insertion, connections | [Containers and devices](#containers-and-devices) |
| Reading, searching, pushing, climbing, switching, eating | [Interactions](#ordinary-interactions) |
| Achievements and endings | [Progress](#achievements-and-endings) |
| Notebook recording and text input | [Notes and input](#notebooks-and-recorded-input) |
| Choices, tool actions, configured callbacks | [Controller configuration](#controller-interaction-configuration) |
| Conditional prose, visibility and state queries | [Conditions](#condition-reference) |
| Clock, delayed events, item timers | [Time](#clock-and-delayed-events) |
| Actor cues, missions, physical transport | [Actors and transport](#actors-missions-and-transport) |
| Rules, events, action results, deterministic saves, alternate views, deployment | [API](api.md) |
| Adding new capabilities and actions | [Extension guide](extending.md) |

## Presentation and discovery

| Location / field | Type and behavior |
| --- | --- |
| `startScreen.title` | String; falls back to world title |
| `startScreen.kicker` | Short string above the title; `subtitle` is a fallback |
| `startScreen.text` | String or paragraph array; `description` is a fallback |
| `startScreen.buttonLabel` | String; defaults to `Start` |
| `startScreen.imageUrl`, `imagePosition` | Opening illustration and crop alignment |
| Room `name`, `description` | Display name and string or named-variant description |
| Room `items`, `exits`, `scenery` | Dictionaries keyed by stable IDs; exits are keyed by destination room |
| Room `cues` | Conditional prose shown with current observations |
| Room `observations` | Array of `{condition, text}`; report a false-to-true condition change across the current turn's scheduler update, while the player stays in that room |
| Room `imageUrl`, `imagePosition` | Default illustration |
| Room `imageVariants` | Ordered `{condition, imageUrl, imagePosition?}` array; first matching variant supplies the current image |
| Object `name`, `article` | Name and grammatical article (`a`, `an`, `the`); keep articles out of names where possible |
| Object `description`, `detail` | String or named-variant description and additional examination detail string |
| Scenery `title`, `description` | Examination popup title and string or named-variant description; room scenery is examinable but cannot be carried |

Images are local project paths included by the build, such as `./assets/study.svg`. `imagePosition.x` accepts `left`, `center`/`centre`, `right`; `y` accepts `top`, `middle`/`center`/`centre`, `bottom`. Defaults center the image. Numeric percentages are not interpreted. The standard view uses start, room and ending images; storing an object image does not create a separate object-image interface automatically.

Entity `description` is a string or named alternatives with a required `default`, selected by `game.describe` in the controller. Return one ID for a single passage, or an ordered array of IDs to compose several passages. See [World descriptions](world-model.md#descriptions) for the format and [Description resolvers](api.md#description-resolvers) for the API.

```json5
{
  description: [
    { id: 'default', text: 'A [[mural|mural]] covers the wall.' },
    { id: 'lit', text: 'Light reveals a [[small plaque|item:plaque]] beside the [[mural|mural]].' },
  ],
  scenery: {
    mural: { title: 'The Mural', description: 'A painted ship approaches the shore.' },
  },
}
```

```js
game.describe('gallery', ctx =>
  ctx.game.findItem('lamp').item.properties.turnedOn ? 'lit' : 'default');
```

Other conditional prose fields accept strings or arrays of strings and `{condition, text}` segments. All matching segments concatenate in order; preserve spaces between them. Entity descriptions also accept these segment arrays, but named alternatives must not contain conditions or mix with segments. Start/end screen `text` arrays are **paragraphs**; use a nested segment array for a conditional paragraph.

In room/examination prose, `[[label|sceneryID]]` links to scenery in the current room, `[[label|item:objectID]]` links to an accessible object, and `**text**` adds emphasis. This is limited inline markup, not a general Markdown renderer. Start/end paragraphs are plain text after condition evaluation.

Room `scenery` contains examinable features such as murals, windows and notices. A feature need not reveal a clue. Its ID is local to its room; use `roomID:sceneryID` for description resolvers. Omit the collection when there are no features. Do not declare both `scenery` and `clues` in one room.

The loader compiles room `scenery` to `rooms[roomID].clues` in the v1 runtime/save format. Controllers use that runtime path; there is only one mutable collection. Existing `clues` input remains accepted. The examination action retains the public name `examineClue`:

`dispatch({type:'examineClue', target:'gallery:mural'})` marks `feature.examined` and normally saves without advancing time. Use rules on `examineClue` for discovery consequences. A controller may configure `feature.onExamine` with `once`, `condition`, `consumesTurn` and registered `effects`; that behavior belongs outside JSON5. `examined` and `onExamine.examined` are runtime progress.

For scenery with ordinary actions (opening a window, pushing a statue), declare an object in room `items` instead. Its optional `scenery: true` flag suppresses automatic listing while preserving normal actions. Room `scenery` and the object listing flag have different roles; neither implies a puzzle reward or discovery.

## Navigation and blockers

| Exit field | Type / default / meaning |
| --- | --- |
| `before`, `after` | Strings around the destination link; without custom text the default is “the exit to … is open” |
| `label` | String overriding the linked room name |
| `description` | String from which display text can be derived; prefer explicit `before`/`after` |
| `listed` | Boolean; `false` omits this exit from the automatic list, without removing the connection |
| `visibleWhen` | Condition; false prevents both listing and travel |
| `condition` | **Blocking** condition: a true ordinary condition blocks travel with its `message` |
| `variants` | Display alternatives with optional `id`, `before`, `after`, `label`. The controller supplies conditions and runtime priority; the first matching variant wins. Does not replace the base travel checks. |
| `successMessage`, `successTitle` | Travel feedback; title defaults to `Done` for immediate movement |
| `deferMoveUntilMessageClosed` | Boolean; delays successful movement until feedback is acknowledged |
| `beforeMove` | `{condition?, message, title?}`; an acknowledged pre-travel message, default title `Before Moving` |

A blocker must provide a nonempty `message`: navigation uses the returned message to stop travel. Do not confuse an exit's blocking `condition` with `visibleWhen`, which must be true to allow visibility/travel.

```json5
{
  exits: {
    hall: {
      before: 'a door leads to the ',
      condition: {
        type: 'itemState', item: 'oakDoor', state: 'door.locked',
        value: true, message: 'The oak door is locked.',
      },
    },
  },
  items: {
    oakDoor: { name: 'Oak Door', door: true, openable: true, lockable: true, locked: true },
    archway: { name: 'Archway', scenery: true, passage: { destination: 'hall', label: 'Enter' } },
  },
}
```

The door's state does not automatically block an exit; declare the relationship in the exit. Add a closed-door condition too if passage requires an open door. `passage.destination` references an existing room and uses the current room's exit to implement Enter.

For multiple prerequisites, an exit can use `condition: {type:'requirements', requirements:[{item, state, value?, message?}], message}`. Each requirement is an item-state equality with default `value:true`. One unmet requirement uses its message; several use the group message. This special form belongs on exit blockers, not general prose predicates.

Deferred movement is saved in `player.pendingAction`. `acknowledgeMessage` completes it; other actions are blocked while it is pending. Standing on a climbable object normally blocks movement until climbing down. An exit requirement for that object's `climbable.climbed` state is the supported elevated-route exception.

### Naming report alternatives

Give conditional report alternatives stable IDs, just as you name description variants. For an exit, the base fields provide the fallback:

```json5
hall: {
  before: 'the closed doors lead to the ',
  variants: [
    { id: 'doorsOpen', before: 'the open doors lead to the ' },
  ],
},
```

Bind conditions by ID in the controller, and set the runtime priority there when alternatives overlap:

```js
game.registerScript('doorsAreOpen', ctx => ctx.state.player.doorsOpen === true);
const exit = game.state.rooms.gallery.exits.hall;
const catalog = new Map(exit.variants.map(variant => [variant.id, variant]));
const open = catalog.get('doorsOpen');
if (!open || catalog.size !== exit.variants.length) throw new Error('Invalid exit variants');
exit.variants = [{ ...open, condition: { predicate: 'doorsAreOpen' } }];
```

The engine does not infer a condition from an ID. Named exit, NPC cue and mission variants still use their ordinary runtime selection semantics; they are not `game.describe` catalogs. A controller can compile authored names into ordered runtime entries without storing the authoring IDs in saves. Keep that order stable when saved report progress uses indexes. Random alternatives within a cue's `texts` array are a separate collection and need no condition for each sentence.

Likewise, a `climbable.message` may contain named `{id, text}` alternatives. The controller attaches a condition to each selected runtime segment by ID; `buildConditionalText` renders the matching segments. Unlike entity `description`, report segments do not require a `default` ID. Keep plain strings for unconditional feedback. `climbed: false` is initial state, and `downMessage` and `movementBlockedMessage` are ordinary engine feedback, not game-specific rules.

## Object flags and inventory

| Flat object field | Default / behavior |
| --- | --- |
| `scenery` | False when absent. Suppresses the automatic room listing. Still examinable through an inline object link; does not imply fixed, hidden or inaccessible. Container contents are filtered for hidden state, not scenery. |
| `hidden` | False when absent. Prevents ordinary discovery/actions; a hidden parent also makes its contents inaccessible. `game.revealItem(id)` clears it. |
| `portable` | False when absent. Enables taking accessible objects. |
| `fixed` | False when absent. Prevents taking; cannot be explicitly combined with `portable:true` in authoring. |
| `droppable` | Enabled unless explicitly false. Applies to carried items. |
| `requiresHeld` | False when absent. Most uses require the item directly in `player.carried`; examination/read and taking it out remain available. |
| `retain` | False when absent. Keeps the original item in hand after a special insertion/swipe unless its action deliberately moves/replaces it. |
| `wearable` | `true` or `{removable:false, removeMessage:'...'}`. Wear moves a directly carried object to `player.worn`; Remove moves it back. |
| `takeOutCondition`, `takeOutMessage` | Optional condition and failure string restricting removal from a container. |
| `weight` | Optional nonnegative number, stored for controller use. No built-in capacity/weight limit. |

`player.carried` and `player.worn` contain object definitions, not ID arrays. Owned items can be nested in bags. **Owned**, **accessible** and **directly carried** are distinct: a closed bag still belongs to the player, but its contents cannot be used. Tool/key menu options may require direct carrying. `findItem(id)` returns `{item, owner, parentItems, path, accessible, key}`; use `isReachableItem`, `canActOnItem`, `isPlayerOwnedLocation` and `hasAccessiblePlayerItem` when implementing an unusual interaction.

Custom fields are allowed and persist under runtime `properties`. A field has no automatic behavior merely because it sounds meaningful. For example, `powered:true` does not enable a switch unless a rule or supported capability reads it. Store initial story flags explicitly when equality comparisons need false/zero values.

## Containers and devices

`container`, `supporter`, `openable`, `opened`, `lockable`, `locked`, `key`, and nested `items` are described in [World authoring](world-model.md#capabilities).

| Additional field | Meaning |
| --- | --- |
| `accepts` | Array of object IDs. Omitted or containing `'*'` permits ordinary placement of any item; `[]` permits none. |
| `transparent` | Makes contents visible **and accessible**, even when closed. Ordinary Put still requires `opened`. |
| `takeLabel` | Removal button text; default `Take` for supporters, `Take Out` for other containers. |
| `openMessage`, `closeMessage` | Custom open/close feedback; standard prose is supplied when absent. |
| `lockedMessage` | Container/door Open failure message; the normal action menu does not offer Open on a locked door. |
| `insertable` | Dictionary keyed by accepted item IDs, describing special insertion/swipe targets. Each entry can have `label` and `retain`. |

`lockMessage` and `unlockMessage` customize door feedback. The container lock handlers use standard feedback; use a report rule to adjust that response. A keyless `lockable:true` object supports manual locking/unlocking. For mechanisms operated only through special rules, do not accidentally expose a free manual Unlock option.

Ordinary Put uses `accepts`, accessibility and cycle checks. An `insertable` entry takes precedence over ordinary placement for that item. Its controller-installed `action` runs first; the surviving original item moves into the target unless either its own or the entry's `retain` is true. This supports a retained token swipe, as distinct from physically depositing a token. Dispatch `useOn` with the held item as `target` and device as `secondaryTarget`.

Connection authoring:

```json5
{
  name: 'Cable', portable: true,
  connectable: {
    targets: {
      console: {
        connected: false,
        label: 'Connect to Console', disconnectLabel: 'Unplug from Console',
        message: 'The plug clicks home.', disconnectMessage: 'You unplug the cable.',
      },
    },
  },
}
```

Connection entries also support `title`/`disconnectTitle` and controller-installed `action`/`disconnectAction`. Only one target is connected per item; connecting clears other connection flags. The connected item's menu focuses on disconnection. Player movement clears connections on carried/worn items, including nested contents. The `itemConnected` condition queries this state.

## Ordinary interactions

Structured capabilities keep their configuration object; only container/door fields are flattened.

| Capability | Authoring fields and semantics |
| --- | --- |
| `readable` | `{text, noteSources?}`. Text is prose; `noteSources` lists source IDs offering notebook actions in the reading dialog. Read consumes a turn and does not automatically set a `read` flag. |
| `searchable` | `{once?, searched?, message?, title?}`. First search sets `searched:true` and consumes a turn. `once:true` prevents repetition. A controller can supply `action` for discovery. |
| `pushable` | `{pushed?, condition?, pushedLabel?, unpushedLabel?, pushedDescription?, unpushedDescription?}`. Push sets `pushed:true`; labels annotate item names and descriptions reflect state. |
| `pullable` | `{label?, message?, title?}`. Pull resets the same object's `pushable.pushed` state. Requires a pushed object. |
| `climbable` | `{climbed?, message?, downMessage?, movementBlockedMessage?, standingDescription?}`. Climb sets player posture to `{type:'standingOn', item:id}`; climbDown clears it. Normally climb down before pushing, pulling or traveling. |
| `turnable`, `turnedOn` | Boolean capability and state. Turn On/Off changes `turnedOn` and consumes a turn. `turnedOn` alone does not offer switching. |
| `pressable` | `{label?, message?, title?}`. Offers Press; meaningful effects come from a registered rule or controller-installed action. Message-only presses do not consume a turn by default. |
| `edible` | `{outcomeText, consumed:true}`. Eating an accessible owned item reports the text, deletes it and commits a turn when consumed. Without `consumed:true`, the handler reports text without consuming the item/turn. |
| `tool` | `{capabilities:['cut']}`. A directly carried tool can act on matching accessible targets. Capability names are story-selected strings. |
| `cuttable` | `{capability:'cut', tool?:'specificToolID'}`. Restricts which tools match; a controller supplies available `actions` with labels, conditions and actions. |

Use rules for unusual effects; these flags do not automatically reveal secrets or solve puzzles. There is no built-in generic Talk, Give, natural-language parser, capacity system, or general-purpose Use fallback. Register new actions when needed; [extending the engine](extending.md) explains the boundary.

## Achievements and endings

Achievements are a top-level dictionary. The ID is its key; `name` and `description` are presentation strings.

```json5
{
  achievements: {
    firstDiscovery: { name: 'First Discovery', description: 'Find the hidden letter.' },
  },
  endings: [
    { id: 'delivered', title: 'Delivered', kicker: 'Journey complete',
      text: ['The letter reaches its destination.'],
      imageUrl: './assets/study.svg', imagePosition: { x: 'center', y: 'top' },
      encounter: { description: 'A messenger accepts the envelope.' } },
  ],
}
```

Award conditions belong in the controller:

```js
game.after('take', 'letter', ctx => {
  ctx.game.awardAchievement('firstDiscovery');
});
```

`awardAchievement(id)` returns true only for a newly earned, defined achievement; repeat/unknown IDs return false. It records `state.player.achievements[id]=true`, emits `achievementEarned` with the definition, and notifies the view. The browser queues a popup and shows earned/total counts and descriptions. Awarding alone does not commit a turn or save: call it within a committed interaction, or explicitly commit an external controller mutation. `getEarnedAchievements()` returns earned definitions with IDs; `getTotalAchievementCount()` returns the defined total. Do not prefill runtime achievement bookkeeping for a fresh game.

Endings use an `id`, `title` (or `name` fallback), `text`, optional `kicker`, `imageUrl`/`imagePosition`, and optional `encounter.description`. The encounter appears before the ending screen and is continued with `acknowledgeEnding`. Text arrays are paragraphs and can contain conditional paragraph arrays.

```js
game.after('go', 'garden', ctx => {
  if (ctx.state.player.carried.letter) {
    ctx.game.endGame(ctx.state.endings.find(ending => ending.id === 'delivered'));
  }
});
```

`endGame(definition)` records `player.gameOver`, `player.ending` and any pending encounter; it stops further ordinary play. Ending selection/priority belongs to rules, often a `checkEndings` listener. An ending in the model does not automatically trigger. Progress and encounter acknowledgement survive saves.

## Notebooks and recorded input

A notebook is an owned, open container. Notes are top-level item prototypes. A source has `recordable` as one entry or an array:

```json5
{
  name: 'Plaque',
  recordable: {
    container: 'notebook', entry: 'copiedWord',
    buttonLabel: 'Copy the inscription', message: 'You copy the word carefully.',
    onExamine: true, offerInput: true,
  },
}
```

`container` and `entry` are required IDs. Optional `condition` controls availability. `buttonLabel` overrides the button, otherwise `label` supplies a suffix to “Make a note”. `onExamine:false` suppresses the direct item-menu recording option; it is a display boolean, not a callback. `offerInput:true` offers input destinations after recording. `message` overrides feedback.

Recording requires an accessible source, an accessible owned/open notebook, a defined prototype and no live copy of the note ID. It creates a cloned note in the notebook and consumes a turn. `readable.noteSources` and controller message `noteSources` can offer recording separately from the source's direct menu.

A note prototype can have `textValue:'ORCHARD'`, `textInputLabel:'Enter into'`, and `textInputTargets:['terminal']`. Omit the last field to allow any reachable configured input in the current room. The owned note and its holder must be usable.

**Dispatch order:** `game.dispatch({type:'enterText', target:'copiedWord', secondaryTarget:'terminal'})` uses the note first and input device second. Free-form entry uses `{type:'submitInput', target:'terminal', value:'ORCHARD'}`. Configure input handling in the controller as described next.

## Controller interaction configuration

The rule API is preferred for new exceptions. Existing generic choice/device interfaces also accept serializable configuration attached by `register(game)`. These examples are JavaScript configuration, **not world JSON5**.

```js
game.registerScript('terminal.acceptWord', ctx => {
  ctx.state.player.wordAccepted = true;
});
game.findItem('terminal').item.properties.input = {
  label: 'Enter word', prompt: 'Enter the inscription',
  notesOnly: false, caseSensitive: false,
  accepted: [{ value: 'ORCHARD', action: {
    effects: [{ script: 'terminal.acceptWord' }], message: 'Accepted.',
  } }],
  failureMessage: 'That word is not recognised.', failureConsumesTurn: false,
};
```

Input configuration also accepts `condition`, `failureTitle`; accepted entries can use `values` arrays and per-response `caseSensitive`. Matching trims whitespace and ignores case unless either caseSensitive flag is true. `notesOnly:true` hides free-form entry but permits recorded input. Failed input advances time only when `failureConsumesTurn:true`.

A configured **action payload** supports:

| Field | Behavior |
| --- | --- |
| `condition` | Must be true before the action runs |
| `effects` | Array of `{script:'registeredID'}` executed in order |
| `update` | `{item, attribute, newValue}`; full runtime path, e.g. `properties.turnedOn` |
| `message` / `messages` | Feedback string, or nonempty array for deterministic varied feedback; last choice stored in `lastMessage` |
| `messageSuffix` | Conditional prose appended to feedback |
| `title` | Feedback title, default `Done` |
| `noteSources` | Source IDs offering note-recording controls |
| `consumesTurn` | Set true to charge a turn even without state changes |

`performAction(payload)` reports whether state changed or a turn was explicitly requested; its caller commits the interaction. Merely displaying a static message normally does not commit. A source with `actions:[...]` selects the **first** matching conditional action, falling back to `action`. Do not confuse this selection with prose segment concatenation.

Controller attachment points:

- `properties.choices`: array of `{label, prompt?, condition?, action?, actions?, options?}`. Options have `label`, `condition`, `disabledWhen`, and `action`/`actions`; `choose` uses `index`, and `chooseOption` uses `choiceIndex`/`optionIndex`.
- `properties.input`: the input configuration above.
- `properties.pressable.action` / `.actions`; `properties.searchable.action`; `properties.pullable.action`.
- `properties.pushable.onPush`: action payload or conditional `actions`; additionally supports `createExit:{target,before,after}`. Prefer navigation rules for complex topology changes.
- `properties.cuttable.actions`: `{label, condition?, action}` entries; dispatch `tool` with the tool ID and index from `getToolActions`.
- `properties.container.insertable[itemID].action`; `properties.container.onPut`: `{item, condition?, action}` entries, first matching ordinary placement reaction.
- `properties.connectable.targets[targetID].action` / `.disconnectAction`.
- `properties.onExamine` and `properties.readable.action` accept action payloads; clue `onExamine` has the discovery configuration described above. Controller-installed ending `effects` run when `endGame` is called.

`onTake` and `onMove` are not automatic standard action triggers. Use `after('take', ...)` and the `itemMoved` event rather than expecting a stored field to execute.

Register script IDs in every new runtime before loading saves. A `{predicate:'registeredID'}` condition refers to a synchronous controller predicate; it is installed by the controller. Script callbacks receive `game.context()` rather than necessarily the originating action's target; capture stable IDs, not mutable state objects, and reacquire `game.state` after loading.

## Condition reference

Conditions are data queries. Most boolean queries default `value` to true; setting it false negates that query. Missing condition means true.

| `type` | Fields / meaning |
| --- | --- |
| `itemState` (also omitted type) | `item`, `state`, `value?`: strict equality at a path relative to item runtime `properties`, e.g. `container.opened`. No coercion; missing is not false. |
| `hasItem` | `item`, `value?`: directly carried, not worn or inside a bag |
| `ownsItem` | `item`, `value?`: any owned inventory depth, regardless of accessibility |
| `itemInContainer` | `item`, `container`, `value?`: immediate container owner |
| `itemInRoom` | `item`, `room`, `value?`: immediate room owner, not nested contents |
| `itemConnected` | `item`, `target`, `value?`: connection flag |
| `itemExists` | `item`, `value?`: live item exists; prototypes alone do not count |
| `currentRoom` | `room`: exact current player room; use `not` to negate |
| `roomVisited` | `room`, `value?`: recorded visit |
| `clueExamined` | `room`, `clue`, `value?`: clue examination progress |
| `elapsedTime` | Inclusive numeric `min` / `max` minutes; requires eligible known timing |
| `all`, `any` | `conditions` array, logical AND / OR |
| `not` | A single nested `condition` |
| `requirements` | Special exit-prerequisite form; see Navigation |

`visibleWhen`, description segments, image variants, note conditions, choices and observation conditions use positive truth. Exit `condition` has the blocking interpretation described above. Conditions do not mutate the world.

## Clock and delayed events

`clock.minutesPerTurn` is a positive integer, default 1 when a clock is declared. `clock.notices` is an array of `{minute, text}`: notices fire when a successful timed action crosses a threshold, even if its step skips over the exact minute. Declare a clock to show the browser time/wait controls. Timed commits still count minutes at the default rate without those controls.

Successful mutations, including Read and recording a note, usually cost one turn. Look and examination are normally free; an examination can still save discovery changes. Failed actions do not advance time unless a configured interaction explicitly charges them. Ending play stops further world advancement.

Use `schedule.afterTurns(count,event,data)` for new delayed reactions; save its returned ID if cancellation is needed. A scheduled job counts the current action's upcoming commit when scheduled before that commit, including from an after rule. Zero waits until the next scheduler advance, not immediate recursive delivery. Jobs due in the same advance run in registration order.

An item-scoped timer is available through `startTimer({item, turns, effects, waitUntil?})`. It replaces the item's timer, has a one-update `justStarted` grace, decrements on later timed updates, and removes itself before running its registered effects. At zero it can wait for `waitUntil` to become true. Cancel it by deleting the item's runtime `properties.timer`.

Commit order: after-action rules at the commit boundary → elapsed minutes/clock notices → `stateCheck` → `checkEndings` → transports → item timers → actor missions → scheduled events → room observations/actor cues → `checkEndings` → view/save. A free commit skips timed updates. Ordering is part of gameplay; do not manually call scheduler advancement in ordinary story rules.

## Actors, missions and transport

Actors are ordinary objects with `npc:{...}`; they remain in room/item collections. There is no separate top-level actor collection consumed by the current engine.

### Actor cues

`npc.state` is a story-defined state string. `nearbyDescription` supplies conditional prose for adjacent accessible rooms. `movementCue` has `condition`, `description`, or ordered `variants:[{condition?, texts:[...]}]`. `turnCue` has `condition`, `intermittent`, and `variants:[{condition?, texts:[...], repeatTexts?:[...]}]`. Text variation uses the saved random seed and avoids immediate repetition when alternatives exist.

Reports are stored in player movement cues. Explicit mission reports supersede incidental fresh movement sound from the same actor. Runtime fields such as `lastTurnCue`, `lastTurnCueVariant`, `lastMissionReport`, `ambientCountdown`, and movement cue `lastText` need no initial bookkeeping.

### Missions

`npc.missions` defines ordinary routes, destinations and phase labels. Route selection uses edge conditions, not the player exit blocker automatically; encode the appropriate door/access checks on route edges too. Keep exceptional triggers and registered effects in controller configuration.

| Field | Contract |
| --- | --- |
| `home`, `idleState` | Home room ID and resting state string |
| `states` | Strings for `outbound`, `searching`, `returning` |
| `routes` | Room-keyed arrays of edges `{to, condition?, transport?, effects?}`; routing uses breadth-first search over these permitted edges; non-transport edges must correspond to actual room exits |
| `destinations` | Dictionary keyed by mission ID; each entry needs a `room` and positive integer `searchTurns` |
| Destination availability | `condition` gates starting; `repeatWhen` permits repeating a completed destination |
| Destination prose | `departure`, `departureReply`, `arrival`, `finished`: arrays of varied report strings |
| Destination `variants` | First matching conditional override for visit duration, arrival/finished prose and configured effects; each variant supplies a positive integer `searchTurns` |
| `homeReport`, `blockedReport` | Varied report arrays |
| `sounds` | Room-keyed varied ambient report arrays |

Start with `game.startMission({item:'courier', destination:'inspectGarden', force:false})` inside a committed interaction. Returns false when unavailable or unreachable. `force` bypasses active/completed restrictions, not destination conditions or missing routes. Starting removes the actor's item timer. Saved `npc.mission` holds `active`, `destination`, `phase`, countdown and transport ride; `npc.completed` records completed destinations. Completion occurs after searching, before returning home. A state change away from the expected phase interrupts the mission. Without a route, it reports blockage and returns to idle state without teleporting home.

### Transport

A controller object has `transport:{room, stops, currentFloor, doorsOpen, phase, queue, notices?}`. `room` identifies the cabin room; `stops` is keyed by landing room ID, `currentFloor` names one stop, `doorsOpen` is boolean, `phase` is `'idle'` or `'moving'`, and `queue` starts as `[]`. These structured transport fields currently need explicit initial values; ordinary collection defaults do not fill them.

```js
game.requestTransport({
  item: 'liftController', destination: 'upperLanding', actor: 'player', dwell: 1,
});
```

Requests support `condition` and registered `effects` for arrival. Duplicate actor/destination requests are rejected. Queued conditions are checked again when selected. Departing closes doors and sets moving; the next transport update arrives and opens them. Stop-configured effects run at departure toward that stop. Arrival callbacks run only if their condition still holds. Dwell delays selection of another request; entering/leaving the cabin holds open doors for that action.

`transport.notices` maps `departure`, `arrival`, `opening` to arrays of `{room, condition?, text}`. Only notices for the player's current room are reported. Saved `request`, `queue`, `dwell`, `phase`, `doorsOpen` and `currentFloor` fully identify transport progress. Story rules/configured effects must maintain the cabin's actual exit connections; the transport state machine does not infer an entire lift topology.

A mission route edge with `transport:'liftController'` uses physical waiting → ready → boarded → riding stages. Boarding and choosing a destination occupy separate updates. The actor actually enters the cabin room; player interference can delay its trip.

## Mutable state and model helpers

Do not author routine bookkeeping: `player.started`, `gameOver`, `ending`, `endingEncounter`, `pendingAction`, `posture`, `achievements`, `turnObservations`, `movementCues`, and runtime `turn`, `scheduled`, `nextScheduleId`, `randomSeed` are maintained by the engine. Initial `visitedRooms` may be omitted. Compatible saves retain these fields and configured interaction metadata.

Controller helpers do not independently enforce every player-action restriction or commit a turn. Use dispatch for attempted actions and rules for exceptional mutations:

- `ctx.set(id,'properties.flag',value)` / `performUpdateAction({item,attribute,newValue})`: existing parent path, clone serializable values through context.
- `ctx.move(id,{type:'room',room:'garden'})`: also supports `carried`, `worn`, `container` with `item`. Prevents duplicate ownership and containment cycles.
- `moveItem(id, collection)`: direct canonical owner collection; `deleteItem(id)` removes and returns an item; `revealItem(id)` clears hidden state.
- `createItemByEffect({item,to})`: clone a prototype into a destination; refuses duplicate live IDs. `setItemIdByEffect({item,to:'newID'})` replaces with that prototype if present, otherwise clones the existing item under the new ID.
- `movePlayerByEffect({room})`: direct story movement; clears posture/connections and records a visit. Use `go` for ordinary exit validation and dispatch consequences.
- `createExit({from?,target,before,after})`: create a connection with display parts; for richer exit data assign the full declarative exit in a rule and validate it.

For new clients, use query methods and dispatch from [API](api.md), rather than low-level handlers. For new engine semantics, follow the [extension checklist](extending.md).
