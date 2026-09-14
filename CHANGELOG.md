# Changelog

## 1.0.0

First reusable platform release, extracted from the working King's Diamond implementation.

- Separate `@paulbowler/if-engine` and `@paulbowler/if-browser` packages.
- Common synchronous action dispatcher; before, instead, after and report rules.
- Generic model, inventory, navigation, containers, doors and existing interaction semantics.
- FIFO events, deterministic turn scheduling and serializable local mission/transport state.
- Explicit v1 save-format validation, isolated loads and persisted random seeds.
- Browser UI with configurable world URL, offline registration and explicit startup option.
- Standalone static-site builder with local dependencies, generated import map and complete offline asset manifest.
- Independent study example, packed-consumer tests and GitHub CI on Node 22 and 24.

The King's Diamond's story, artwork, rules and gameplay regressions live in a separate game project and are not part of either package.
