# Interactive Fiction v3.1.0

World authoring now has a packaged JSON Schema and a complete attribute reference.

- Required/optional fields, types, defaults and constraints are documented by element.
- Builds validate parsed JSON5 before normalization.
- The engine exports world.schema.json for authoring tools.
- The reference is generated from schema descriptions and checked in tests.
- Custom game state remains supported on extensible elements.
- Runtime gameplay and world/save schema versions are unchanged.

Install both packages together. Malformed authoring fields that were previously ignored can now fail a build.
