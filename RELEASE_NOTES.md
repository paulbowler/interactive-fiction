# Interactive Fiction v2.1.0

Controllers can use `game.getEntity`, `game.readProse` and context helpers
`get`, `inRoom` and `inContainer` instead of repeating model traversal. Entity
lookup is also available as the pure `findEntity` export. Description resolution
uses the same lookup internally. Prose queries validate strings and string lists
and do not mutate the model.

This is an additive release compatible with the 2.x action, world and save
contracts. See the [API reference](docs/api.md#entity-and-prose-queries) and
[designer tutorial](docs/tutorial.md).

Both packages are MIT licensed. Install the versioned GitHub archives and retain
the lockfile to reproduce a game build.
