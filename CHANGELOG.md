# Changelog

## 2.1.0

- Share entity lookup between description resolution and controller queries.
- Add validated, read-only entity prose access and current-state context helpers.
- Test containment, prototype lookup, prose validation and restored-state queries.

## 2.0.0

- All player intentions use common dispatch, explicit rule outcomes and successful-action commits.
- Ordinary actions use capabilities; story consequences use before/instead/after rules and deterministic events.
- Named read-only queries select text, images, exits, actor reports, mission readiness and menu choices.
- Remove executable action/effect records, the condition expression interpreter and script registration.
- Delayed work uses named events and explicitly registered boolean predicates; complete runtime state remains serializable.
- Transport entities live in the transports collection, with declared boarding spaces and event-driven feedback.
- Validate complete worlds at construction and reject invalid saves atomically.
- Update authoring, API and extension documentation; verify packed independent games and browser/offline behavior.


## 1.6.2

- Preserve object-local `prose` as presentation data alongside descriptions through normalization, movement and save/load.
- Document entity-owned prose for rooms, objects, actors and transports; reserve game-level catalogs for shared text.
- Update authoring and controller examples to read prose from its owner.

## 1.6.1

- Author transport stops as an array of room IDs when stop and room IDs match.
- Normalize to the existing dictionary; controller APIs and saved journeys remain unchanged.
- Validate duplicate, empty, invalid and unknown stop references.
- Document both authoring forms in the model reference, tutorial and transport API.

## 1.6.0

- Independent transport entities reference a room-backed boarding space and named stops.
- Derive boarding connections and validate transport state and references.
- Reuse physical NPC boarding, deterministic queues and saved journeys across genres.
- Add transport lookup and departure/arrival events; retain the v1 item-based transport API.
- Document named ambient prose and controller-owned report selection.

## 1.5.0

- ID-only inline scenery and item links resolve labels from current entity names.
- Explicit labels remain available; popup titles can differ from inline names.
- Validate scenery names and preserve supplied room context, saves and existing markup.

## 1.4.0

- Author examinable room features in a `scenery` collection, with room-local IDs and named descriptions.
- Normalize to the unchanged v1 runtime/save representation; existing controllers and examination progress remain compatible.
- Validate scenery collections, entries and description catalogs with clear authoring paths.
- Clarify room scenery versus the object listing flag in the authoring reference.

## 1.3.0

- Description selectors can return an ordered list of variant IDs to compose several named passages.
- Selection order is independent of catalog array order; empty selections intentionally produce no prose.
- Unknown, non-string and duplicate selected IDs fail clearly.
- Composition preserves existing room and examination spacing without storing derived prose.

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
