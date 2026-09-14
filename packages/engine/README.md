# @paulbowler/if-engine

Version 1.0.0. A synchronous, deterministic interactive-fiction engine with no browser or runtime dependencies. MIT licensed.

```js
import { createGame, STOP } from '@paulbowler/if-engine';
const game = createGame(world);
game.before('take', 'letter', ctx => {
  if (ctx.state.player.waiting) { ctx.say('Please wait.'); return STOP; }
});
game.dispatch({ type: 'take', target: 'letter' });
const restored = createGame(world).load(game.save());
```

Register the same story rules and scripts before loading a save. Engine patch/minor updates retain v1 save compatibility. Story version and world schema are independent of the package version.

The public entry point exports `createGame`, `CONTINUE`, `STOP`, `HANDLED`, and version constants. Internal file paths are not public imports. See the [API and world schema](https://github.com/paulbowler/interactive-fiction/blob/main/docs/api.md).

Requires Node.js 22+ for development, or a modern browser with ES modules. Game definitions and rules are trusted application code; saves must contain JSON data only.
