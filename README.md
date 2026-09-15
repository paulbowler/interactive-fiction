# Interactive Fiction

Reusable JavaScript packages for standalone point-and-click games. **Version 1.6.2 · MIT · Node.js 22+ tooling · No browser runtime dependencies.**

| Package | Purpose |
| --- | --- |
| `@paulbowler/if-engine` | Headless model, standard actions, dispatch, rules, events, scheduling and saves |
| `@paulbowler/if-browser` | Browser interface, default theme/template and standalone offline build command |

A game supplies its world, story controller and assets. The packages provide the shared engine and interface; each game lives in an independent project.

**New game designers:** follow the [step-by-step tutorial](docs/tutorial.md). **Agents:** read the [authoring guide](docs/agent-guide.md).

## Start a game

Copy [`examples/study`](examples/study) into a new project outside this repository:

```sh
cd my-game
npm ci
npm test
npm run build
npm run serve
```

Open http://localhost:8000. Deploy **only `dist/`** to a static host, including GitHub Pages subdirectories. Each build includes its selected engine/view, world and all assets. No runtime CDN, Node server or database is required. Offline installation needs HTTPS or localhost.

```text
my-game/
  package.json             # pinned release dependencies
  package-lock.json        # exact versions and integrity hashes
  if.config.json           # inputs and output folder
  data/game.json5          # declarative world and prose
  assets/                  # images and other assets
  src/main.js              # initialize engine and view
  src/story.js             # register exceptional rules
```

```js
import { createGame } from '@paulbowler/if-engine';
import { mountBrowser } from '@paulbowler/if-browser';

export const browserView = mountBrowser(world => {
  const game = createGame(world);
  game.after('take', 'letter', ctx => {
    ctx.state.player.letterDiscovered = true;
  });
  return game;
});
```

Ordinary taking, dropping, containers, locks, inventory and movement need world properties, not bespoke scripts. See the [compact JSON5 world format](docs/world-model.md), [model and controller feature reference](docs/feature-reference.md), and [API guide](docs/api.md). To add capabilities, use the [extension guide](docs/extending.md).

## Install or upgrade a release

Packages are distributed as npm-compatible archives on [GitHub Releases](https://github.com/paulbowler/interactive-fiction/releases). No npm registry account is needed to consume them. The template’s `.npmrc` permits its declared release URLs on npm 12 and later.

```sh
npm install --save-exact --allow-remote=root https://github.com/paulbowler/interactive-fiction/releases/download/v1.6.2/paulbowler-if-engine-1.6.2.tgz https://github.com/paulbowler/interactive-fiction/releases/download/v1.6.2/paulbowler-if-browser-1.6.2.tgz
```

For an upgrade, install both archives for the desired release, run the game's tests, rebuild and redeploy. Commit the updated package and lock files. Existing deployments keep their installed release until redeployed. Keep the previous `dist` or source/lockfile release to roll back.

Engine package version, world schema, save format and story release are independent. Engine v1 upgrades accept v1 saves. A game that changes its own story version must explicitly choose whether and how to migrate its saves. See [compatibility and releases](docs/releases.md).

## Develop the platform

```sh
npm ci --ignore-scripts
npm test
npm run pack:release
npx playwright install webkit
npm run test:browser
```

`release/` receives two archives and `SHA256SUMS`. Tests install the archives into a temporary independent project, run its story tests, build it, check repeatable offline output and reinstall from its lockfile. CI repeats this on Node 22 and 24.

Game projects maintain their own story replays and browser tests. Run representative consumer-game tests before a platform release; see [release procedure](docs/releases.md).

The packages are plain ES modules with explicit entry points. Internal source paths are not supported imports. The browser package is optional; another client can dispatch actions directly to the headless engine.

## Scope

V1 is synchronous and single-player. It provides point-and-click object interactions, navigation and story rules. Conversation systems and natural-language parsing can be added by game controllers. The default browser view mounts once per document. Game scripts and prose are trusted application content; see [security boundaries](SECURITY.md).
