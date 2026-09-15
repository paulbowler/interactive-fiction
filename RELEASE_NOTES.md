# Interactive Fiction v1.6.1

Transport stops now accept the compact authoring form `stops: ['harbour', 'island']` when stop IDs match room IDs. The loader expands this to the existing dictionary. Dictionary syntax remains available for distinct stop IDs and additional declarative attributes. Empty arrays, duplicate IDs, invalid entry types and broken references fail clearly.

This is an authoring-only simplification. Transport requests, journey timing, controller behavior, runtime schema and saves remain unchanged. Model, transport API and tutorial documentation cover both forms and the room-backed boarding scope.

The two MIT-licensed packages are:

- `@paulbowler/if-engine`: reusable headless game engine.
- `@paulbowler/if-browser`: browser view, default interface and standalone/offline site builder.

Install the attached release archives as exact dependencies:

```sh
npm install --save-exact --allow-remote=root https://github.com/paulbowler/interactive-fiction/releases/download/v1.6.1/paulbowler-if-engine-1.6.1.tgz https://github.com/paulbowler/interactive-fiction/releases/download/v1.6.1/paulbowler-if-browser-1.6.1.tgz
```

Copy the [study template](https://github.com/paulbowler/interactive-fiction/tree/main/examples/study), including `.npmrc`, to start a game. Run `npm ci`, `npm test` and `npm run build`; deploy `dist/`. Builds contain their chosen engine version and all assets and do not depend on a runtime CDN.

Commit the dependency lockfile. To upgrade, install the corresponding archives for the new release, run the game's regression tests, rebuild and redeploy. Engine version, story version and save format are independent. V1 saves remain supported within the v1 release line.

Requires Node.js 22+ for tooling and a modern browser supporting ES modules and import maps. The standard view mounts once per document. The engine is synchronous and single-player; asynchronous rules and multi-actor player dispatch are not supported.

`SHA256SUMS` records the archive hashes. These archives are npm-compatible packages distributed through GitHub Releases; publication to the npm registry is separate.

Documentation: [README](https://github.com/paulbowler/interactive-fiction#readme), [designer tutorial](https://github.com/paulbowler/interactive-fiction/blob/main/docs/tutorial.md), [agent guide](https://github.com/paulbowler/interactive-fiction/blob/main/docs/agent-guide.md), [API](https://github.com/paulbowler/interactive-fiction/blob/main/docs/api.md).
