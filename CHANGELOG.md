# Changelog

## 1.2.1

- Preserve controller-configured room image conditions during browser startup and save restoration.
- Preload images from the configured model.
- Browser regression covers conditional images through state changes and offline reload.

## 1.2.0

- One `description` field for plain text or named variants, with a required default.
- `game.describe` controller registration and `game.getDescription` queries for rooms, objects and clues.
- Description validation, deterministic selection and save/restore regression coverage.
- Study template and documentation demonstrate state-dependent prose outside the model.
- Compatible runtime schema and save format 1; existing conditional segments retain their semantics.

## 1.1.0

- Compact JSON5 world authoring with flat capabilities and nested contents.
- Public `normaliseWorld` and Node `loadWorld` with defaults and structural validation.
- JSON5 compilation during standalone builds, with no deployed parser dependency.
- Updated study template, tutorial, world reference and agent guide.
- Compatible runtime schema and save format 1; added authoring and containment regressions.

## 1.0.0

First release of the Interactive Fiction platform.

- Separate `@paulbowler/if-engine` and `@paulbowler/if-browser` packages.
- Common synchronous action dispatcher; before, instead, after and report rules.
- Generic model, inventory, navigation, containers, doors and object interactions.
- FIFO events, deterministic turn scheduling and serializable local mission/transport state.
- Explicit v1 save-format validation, isolated loads and persisted random seeds.
- Browser UI with configurable world URL, offline registration and explicit startup option.
- Standalone static-site builder with local dependencies, generated import map and complete offline asset manifest.
- Independent study example, packed-consumer tests and GitHub CI on Node 22 and 24.

Game content is supplied by independent consumer projects. The platform includes a small study example for learning and integration tests.
