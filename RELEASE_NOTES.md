# Interactive Fiction v3.2.2

Fix custom object articles in generated descriptions and browser listings.

An object with `"name": "fireside tools"` and `"article": "a set of"` now displays **a set of fireside tools**, with only **fireside tools** clickable.

- Authored article phrases are used without a supported-value restriction; omitted or blank articles use automatic `a`/`an`.
- `"none"` continues to omit the article. Definite action prose and bare object names retain their existing behavior.
- World schema 2 and save format 1 are unchanged.

Update both engine and browser packages to 3.2.2 and rebuild your game.
