# Compatibility and release procedure

The platform uses synchronized semantic versions for its engine and browser packages. Patch releases fix behavior without changing the public contract. Minor releases add compatible capabilities. Breaking public API, world schema or save semantics require a major release and migration instructions. Internal implementation paths are hidden behind package exports.

Story release, world schema and saved-state format are independent. Never tie a game's story version to the engine package number just to deploy an upgrade. Save envelope 1 remains supported; game-owned conversion must remove executable records before loading them into the current API. Adding optional runtime fields must retain defaults for compatible saves. Game-specific state migrations belong to the game's controller.

## Before a release

1. Update both package versions, root version, exported version constants, example dependency URLs, changelog and release notes.
2. Run `npm ci --ignore-scripts` and `npm run check`. The tests install packed artifacts into an independent project, not workspace symlinks.
3. Install the candidate archives into representative independent game projects. Run their headless replays and browser tests while serving the new `dist`. Keep story-specific tests and save fixtures with each game.
4. Review `npm pack --dry-run` contents. No games, artwork, credentials, tests, development caches or local paths belong in release archives.
5. Commit the tested source and tag `vX.Y.Z`. Verify the GitHub CI matrix before publishing the archives.
6. Run the repository's manual release workflow with that tag, or create a GitHub release with the exact tested archives and `SHA256SUMS`. Do not overwrite a published version's assets; issue a new version.
7. Install from the public release URLs in an independent checkout and commit its lockfile. Verify downloaded archive checksums match the release.

The workflow is explicitly invoked and does not publish on every push. npm registry publication is optional and requires separate npm credentials or trusted-publisher configuration. GitHub archives are already directly installable by npm and lockfiles preserve their integrity.

## Updating a game

Install the new release URLs, run that game's replays/failure/save tests, build and deploy the entire output together. Keep the previous source commit and lockfile for rollback. Do not overwrite individual engine files in an existing offline deployment: deploy the complete generated release so its asset manifest and worker agree.

The browser worker installs all required assets before activation and keeps cache names scoped to the deployment path. Existing tabs are navigated after a complete new release activates. Each game deployment needs its own directory; serving two games at the same URL also shares their deployment cache.
