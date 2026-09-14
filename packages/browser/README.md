# @paulbowler/if-browser

Version 1.0.0. The browser view and standalone-site builder for `@paulbowler/if-engine` v1. MIT licensed.

```js
import { createGame } from '@paulbowler/if-engine';
import { mountBrowser } from '@paulbowler/if-browser';
export const browserView = mountBrowser(world => {
  const game = createGame(world);
  registerStory(game);
  return game;
}, { worldUrl: './data/game.json' });
```

Provide `src/main.js`, `data/game.json`, assets and `if.config.json`, then run `if-build`. Deploy the resulting `dist` directory to any static HTTP host. It contains the selected engine and view, every game asset, an import map and an automatically generated offline worker. Nothing loads from a runtime CDN.

Use `autoStart: false` and `await view.start()` for explicit initialization; `serviceWorkerUrl: false` disables offline registration. One view mounts per document. Styling and HTML templates can be overridden in the build configuration.

The builder requires Node.js 22+ and has no external dependencies. See the [project template](https://github.com/paulbowler/interactive-fiction/tree/main/examples/study).
