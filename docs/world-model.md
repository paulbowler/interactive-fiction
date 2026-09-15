# Authoring a world

For field types, required/optional attributes and defaults, see the [attribute reference](model-attributes.md) and [schema guide](schema.md).


Write your world in `data/game.json5`. JSON5 supports comments, trailing commas, single or double quoted strings, and unquoted identifier keys. It remains data: no imports, variables, function calls or callbacks.

```json5
{
  id: 'quiet-study',
  title: 'A Quiet Study',
  clock: { minutesPerTurn: 1 },
  player: { room: 'study' },
  rooms: {
    study: {
      name: 'Study',
      description: 'A wooden box rests beside a brass key.',
      exits: { hall: {} },
      items: {
        brassKey: { name: 'Brass Key', portable: true },
        woodenBox: {
          name: 'Wooden Box',
          container: true,
          openable: true,
          lockable: true,
          locked: true,
          key: 'brassKey',
          items: {
            letter: {
              name: 'Letter',
              description: 'Meet me at dusk.',
              portable: true,
            },
          },
        },
        desk: { name: 'Desk', supporter: true },
        statue: { name: 'Statue', fixed: true },
      },
    },
    hall: { name: 'Hall', exits: { study: {} } },
  },
}
```

For scenery, achievements, prose, navigation, notebooks, devices, actor missions and transport, see the [model and controller feature reference](feature-reference.md). It distinguishes authoring data from controller configuration and engine-maintained state.

Room `scenery` is an optional dictionary of examinable features, such as a mural or notice. For example, `scenery: { mural: { name: 'mural', title: 'Mural', description: 'A painted ship.' } }` pairs with the prose link `[[mural]]`. Use ordinary `items` for objects that need actions such as opening or pushing. See the [scenery reference](feature-reference.md#presentation-and-discovery) for controller access and saved state.

## IDs and values

Entity IDs are collection keys. Keep them stable for references, rules and saves. `brassKey` is an unquoted key; a kebab-case key must be quoted: `'brass-key'`. References are always strings, such as `key: 'brassKey'` and `room: 'study'`. Display names and prose are strings too. Use real booleans and numbers: `portable: true`, `weight: 3`.

Each live object has a unique ID, including inventory and nested contents. Room and live object IDs must not conflict. Optional top-level `items` defines prototypes for later creation; a prototype can share its live instance's ID. Do not instantiate two live copies with that ID.

## Required fields and defaults

Provide `title`, `player.room`, and `rooms`. A stable `id` is strongly recommended; without it, the title identifies saved games. Room names and descriptions supply the text players see.

| Field | Omitted value |
| --- | --- |
| `version` | String `'1'`, your story compatibility version |
| `startScreen` | `{ title: world.title }` |
| `items`, `achievements` | Empty collections |
| `endings` | Empty array |
| Room `items`, `exits` | Empty collections |
| Player `carried`, `worn` | Empty collections |
| Player `elapsedMinutes` | `0` |
| `clock` | No optional clock controls |
| `clock.minutesPerTurn`, when `clock` is present | `1` |
| `openable` object's `opened` | `false` |
| `lockable` object's `locked` | `false` |
| Container/supporter `items` | Empty collection |

Other story state has no inferred default. Preserve meaningful explicit values, including `false`, when rules or conditional prose inspect them.

## Capabilities

Put capabilities directly on an object; there is no authoring `properties` wrapper.

| Capability | Meaning |
| --- | --- |
| `portable: true` | Can ordinarily be taken and carried |
| `fixed: true` | Cannot ordinarily be taken; do not also declare portable |
| `container: true` | Holds nested `items` |
| `supporter: true` | Holds accessible, visible items on its surface |
| `openable: true` | Container or door supports opening/closing |
| `lockable: true` | Container or door supports locking/unlocking |
| `door: true` | Supplies door state for navigation and interactions |
| `opened: true` | Contents are accessible, or the door starts open |
| `locked: true` | Starts locked; requires `lockable: true` |
| `key: 'objectID'` | Matching key for a lockable container or door |

Supporters need neither `container: true` nor `opened: true`. They cannot be openable, lockable, locked or explicitly closed. A container may be open without supporting an Open action: an open bag can declare `container: true, opened: true`. A container without `opened` or `transparent` has inaccessible contents; declare `openable: true` when players should be able to open it. `transparent: true` follows the engine's accessible-content semantics, so do not use it to model a sealed glass barrier.

An object cannot be both a door and a container, or start both open and locked. Containers can specify `accepts`, `insertable`, `transparent`, `takeLabel` and opening/locking prose directly. Structured capabilities such as `readable: { text: '...' }` and `passage: { destination: 'hall' }` retain their own configuration objects. Declare vehicles in the top-level `transports` collection, separately from control objects. Story flags can also be flat fields. Names, articles, descriptions, `prose`, detail and image fields are presentation attributes. Object `prose` remains alongside `description` in normalized runtime data and saves; it is not a capability under `properties`.

## Descriptions

Use the same `description` field on rooms, objects and scenery. A string is displayed directly:

```json5
description: 'A brass key.',
```

An array declares named alternatives. Exactly one variant must have `id: 'default'`. IDs must be unique nonempty strings; each entry contains only `id` and string `text`. Array order does not select the text.

```json5
description: [
  { id: 'default', text: 'The box is closed.' },
  { id: 'opened', text: 'The box is open.' },
],
```

Register the selection logic in your controller:

```js
game.describe('woodenBox', ctx =>
  ctx.target.properties.container.opened ? 'opened' : 'default');
```

The controller returns a variant ID, or an ordered array of IDs to combine passages, keeping prose in the model and puzzle conditions in JavaScript. Without a resolver, or when it returns `undefined`, the engine uses `default`. An unknown ID is an error. An empty returned array intentionally produces no text. Duplicate IDs and non-string selections are errors. The order returned by the controller determines composition, independently of catalog order. Existing authored spaces are retained; examination prose also retains the engine’s sentence-spacing behavior. Plain strings bypass selection. A compact named-object spelling is also supported: `description: { default: 'The box is closed.', opened: 'The box is open.' }`.

Use room IDs for rooms and `roomID:sceneryID` for room scenery. Selection happens whenever text is requested, including after restoring a save. Resolvers must be synchronous and should only read current state: rendering must not change game progress, emit events or advance time. Re-register resolvers in every game factory before loading. No selected variant is cached in the save.

`game.getDescription(id)` returns the selected base text. Normal room/examination rendering uses the same selection and retains its usual annotations, cues and inline links. This format applies to entity descriptions; it does not change start-screen paragraphs, ending text, readable text, cues or other prose fields. See the [description API](api.md#description-resolvers).

Conditional segment arrays without variant IDs remain supported: their matching segments concatenate in order. Do not mix those segments with named variants. For new state-dependent descriptions, prefer named variants and controller selectors.

## Containment and runtime state

Nested `items` declare initial ownership. For example, `rooms.study.items.woodenBox.items.letter` places the letter inside the box. Initial inventory uses the same syntax in `player.carried` or `player.worn`. Do not also add a competing `location` field.

`normaliseWorld(data)` produces an independent canonical model. `createGame(data)` also accepts the authoring model directly. Neither mutates the input. At runtime, room items and inventory remain collections; object capabilities live under `properties`, and container contents under `properties.container.items`. Supporters use that same runtime container structure. The current room is `state.player.currentRoom`.

Use `game.findItem('letter')` to obtain its current item and owner. Actions and `ctx.move` transfer ownership rather than maintaining a second location table. `game.world` is the independent initial definition; `game.state` is mutable. `save()` produces serializable state and `load()` restores it. Authoring defaults are not reapplied to loaded saves.

Rules inspect runtime paths, for example `ctx.target.properties.container.locked`; they do not mutate the authoring file. Ordinary structure belongs in the model. Exceptional restrictions and consequences belong in registered JavaScript rules. Do not put `onTake`, `script`, `callback` or effect programs in the world.

## Loading and validation

The Node-only build utility provides a loader for headless tests:

```js
import { loadWorld } from '@paulbowler/if-browser/build';
import { createGame } from '@paulbowler/if-engine';

const world = await loadWorld(new URL('./data/game.json5', import.meta.url));
const game = createGame(world);
registerStory(game);
game.validateWorld(game.state);
```

The JSON5 loader and normalizer reject broken starting-room, exit, passage and key references, duplicate entity IDs across collections, contradictory capabilities, invalid native types and non-serializable values. Diagnostics identify the file and property path. Construction validates the complete canonical world. Loading additionally validates transport queues, notebooks and registered delayed predicates before replacing state. Executable condition/action/effect records are rejected.

`if-build` parses and normalizes the authoring file, then writes `dist/data/game.json`. The authoring `.json5` file is omitted from deployment. The browser uses the compiled JSON URL, so players need no JSON5 parser. A configured `.json` world is also accepted. Custom world filenames compile to the same path with a `.json` extension; set the view's `worldUrl` accordingly.

Put an optional `prose` dictionary on the entity that owns its named report strings or lists of strings: room observations on the room, object feedback on the object, actor reports on the actor and transport notices on the transport. Keep only genuinely shared text in a game-level catalog. Controllers read that text to construct conditional exit, actor and action reports. Keep `variants` records, selection conditions and variant-specific timings in controller JavaScript; initial prose stays on its room or object. See [Naming report alternatives](feature-reference.md#naming-report-alternatives).


## Transport entities

Use `transports` for named vehicles or conveyances with a boarding space and defined stops. Each transport owns its journey state; its `space: {room: 'interiorId'}` owns the occupants through normal room containment. Stops map stable stop IDs to ordinary room IDs. When the IDs match, write `stops: ['westBank', 'eastBank']`; otherwise use `stops: {west: {room: 'westBank'}, east: {room: 'eastBank'}}`. The normalizer expands arrays into the same runtime dictionary without changing IDs or saves. The normalizer supplies empty journey bookkeeping and creates inspectable boarding connections. Controls and exceptional journey rules stay in JavaScript, with all report text in named model prose. See the [transport schema, defaults and controller API](feature-reference.md#transport).

Room-backed spaces are supported now. Enterable-container and rideable-supporter spaces are not yet supported and are rejected rather than treated as rooms.

## Door connections and departure footing

Link an exit to a door with a readable object reference:

```json5
exits: {
  hall: { door: 'oakDoor' },
},
items: {
  oakDoor: {
    name: 'Oak Door',
    door: true,
    openable: true,
    lockable: true,
    locked: true,
    lockedMessage: 'The oak door is locked.',
  },
},
```

The standard engine reads that door's lock and opening state. A door without
`openable` does not need a separate opening action after unlocking. Add the same
`door` reference to the reverse exit when appropriate. Missing references and
references to ordinary non-door objects fail validation.

An exit such as `loft: { standingOn: 'crate' }` describes departure from a
climbable object. The object must exist and expose `climbable`; ordinary movement
away from that footing requires climbing down. Exceptional puzzle prerequisites
belong in controller rules. See [navigation queries](api.md#navigation-and-exit-text).
