# @paulbowler/if-engine

Version 3.5.0. A synchronous, deterministic interactive-fiction engine with no browser or runtime dependencies. MIT licensed.

```js
import { createGame, STOP } from '@paulbowler/if-engine';
function createStory(world) {
  const game = createGame(world);
  game.before('take', 'letter', ctx => {
    if (ctx.state.player.waiting) {
      ctx.say(ctx.target.prose.pleaseWait);
      return STOP;
    }
  });
  return game;
}
const game = createStory(world);
game.dispatch({ type: 'start' });
game.dispatch({ type: 'take', target: 'letter' });
const restored = createStory(world).load(game.save());
```

Register the same story rules, predicates and event listeners before loading a save. Engine patch/minor updates retain the documented save contract. Story version and world schema are independent of the package version.

The public entry point exports `createGame`, `normaliseWorld`, `CONTINUE`, `STOP`, `HANDLED`, and version constants. Internal file paths are not public imports. See the [API and world schema](https://github.com/paulbowler/interactive-fiction/blob/main/docs/api.md).

Requires Node.js 22+ for development, or a modern browser with ES modules. World definitions are declarative data; story rules are trusted JavaScript. Saves contain JSON data only. `createGame` accepts compact authoring models; `normaliseWorld` exposes the deterministic normalization step. See the [world authoring guide](https://github.com/paulbowler/interactive-fiction/blob/main/docs/world-model.md).

## Authoring schema

The package exports `@paulbowler/if-engine/world.schema.json` for JSON Schema-aware authoring tools. See the [complete attribute reference](https://github.com/paulbowler/interactive-fiction/blob/main/docs/model-attributes.md) for required/optional fields, types, defaults and capability constraints. The schema describes flat authoring data, not runtime saves.
