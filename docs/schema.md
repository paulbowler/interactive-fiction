# World schema and attribute reference

Use the [attribute reference](model-attributes.md) to look up required and optional
fields, types, defaults and constraints for every supported element. The
[feature reference](feature-reference.md) explains gameplay behaviour and examples;
the [lifecycle guide](engine-lifecycle.md) explains controller callbacks.

## What the schema validates

The engine package exports `@paulbowler/if-engine/world.schema.json`. It is a
JSON Schema Draft 7 document for the **authored** model, before normalization.
Your world remains JSON5. The Node build tool parses JSON5, validates the resulting
data with the schema, then normalizes it.

The schema covers world/player structure, rooms, exits, scenery, objects and
capabilities, descriptions and prose, screens, achievements, endings, clock
notices, notes/input, choices/tools, actors, mission routes and transports.
Its named definitions also document controller report configuration and runtime
records; those are not instructions to author saved-state bookkeeping.

Schema validation catches types, required fields, nested shapes and capability
contradictions. Graph/reference validation and unique IDs across collections
remain the engine's responsibility. For example, a key must be a string in the
schema, while normalization checks that its object exists. Description variant
ID uniqueness is also checked by the engine.

Additional JSON state is allowed on the extensible elements identified in the
attribute reference. Those fields have no automatic behaviour. Structured
records with a fixed interface reject unknown keys. This means an unknown
object-level field may be a custom flag rather than a typo: schema validation
cannot distinguish author intent.

No validation step executes code from the model. The validator does not insert
schema defaults or modify the parsed data. Normalization supplies the actual
defaults. In JSON Schema, default is descriptive metadata, not an instruction
to populate fields; see the [JSON Schema annotation reference](https://json-schema.org/understanding-json-schema/reference/annotations).

## Build and headless validation

Starting with platform 3.1, `npm run build` validates the world automatically.
A failure identifies the source file and the invalid data path. Install matching
engine/browser releases together.

For validation without building a site:

```js
import {loadWorld, validateWorldData} from '@paulbowler/if-browser/build';

// Reads JSON5, validates authoring data and normalizes the result.
const world = await loadWorld('data/game.json5');

// For an already parsed authoring object; returns it unchanged or throws.
validateWorldData({
  title: 'Small World',
  player: {room: 'study'},
  rooms: {study: {}},
});
```

Use `createGame(world)` and your controller factory for full runtime validation
and headless gameplay tests. Do not pass a saved/canonical runtime world to the
authoring schema: it intentionally uses flat capabilities and player.room.
Save/load validation is a separate engine API.

## Editor assistance

Associate your JSON5 world with this local schema in an editor that supports
**both JSON5 parsing and JSON Schema validation**:

```text
node_modules/@paulbowler/if-engine/world.schema.json
```

The example project includes a VS Code `json.schemas` association. The association
alone does not teach an editor to parse JSON5; JSON5 support may require an
extension, and that extension must support schema associations. JSON-with-comments
mode is not equivalent to JSON5: single quotes and unquoted keys remain JSON5
syntax. Build validation works independently of editor support.

You can locate the packaged schema from Node:

```js
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const schemaPath = require.resolve('@paulbowler/if-engine/world.schema.json');
```

Associate the schema externally rather than adding editor metadata to the game
world. The schema travels with the installed engine, so version upgrades also
upgrade the authoring contract.

## Maintaining the contract

When adding an engine field, update its schema definition and field description,
add meaningful validation/behaviour tests, and regenerate the attribute reference:

```sh
node scripts/document-world-schema.js
npm test
```

The test suite checks that the generated document matches the schema. It also
validates a demonstration world exercising the supported feature families,
rejects malformed examples, and tests the release archives as independent
dependencies. Schema validation supplements gameplay tests; it does not prove
that a puzzle can be solved.
