# Authoring a world

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

An object cannot be both a door and a container, or start both open and locked. Containers can specify `accepts`, `insertable`, `transparent`, `takeLabel` and opening/locking prose directly. Structured capabilities such as `readable: { text: '...' }`, `passage: { destination: 'hall' }` and `transport: { ... }` retain their own configuration objects. Story flags can also be flat fields. Names, articles, descriptions, detail and image fields are presentation attributes.

## Descriptions

Use the same `description` field on rooms, objects and clues. A string is displayed directly:

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

The controller returns a variant ID, keeping the prose in the model and puzzle conditions in JavaScript. Without a resolver, or when it returns `undefined`, the engine uses `default`. An unknown ID is an error. Plain strings bypass selection. A compact named-object spelling is also supported: `description: { default: 'The box is closed.', opened: 'The box is open.' }`.

Use room IDs for rooms and `roomID:clueID` for clues. Selection happens whenever text is requested, including after restoring a save. Resolvers must be synchronous and should only read current state: rendering must not change game progress, emit events or advance time. Re-register resolvers in every game factory before loading. No selected variant is cached in the save.

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

The JSON5 loader and normalizer reject broken starting-room, exit, passage and key references, duplicate entity IDs across collections, contradictory capabilities, invalid native types and non-serializable values. Diagnostics identify the file and property path. Full configured-world validation additionally checks conditional prose, transport, notebook and registered script references; call it after registering story modules.

`if-build` parses and normalizes the authoring file, then writes `dist/data/game.json`. The authoring `.json5` file is omitted from deployment. The browser uses the compiled JSON URL, so players need no JSON5 parser. A configured `.json` world is also accepted. Custom world filenames compile to the same path with a `.json` extension; set the view's `worldUrl` accordingly.
