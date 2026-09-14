# Package architecture

```text
Independent game project
  world / prose / assets
  story controller registration
          |
          v
  @paulbowler/if-engine <---- @paulbowler/if-browser
          |                         |
  actions / rules / events      DOM / persistence
  model / scheduler                 |
                              if-build → dist/
```

The engine has no browser or game imports. The browser receives a game factory. The builder reads the installed dependency versions and copies their runtime files into a self-contained deployment, then generates an import map and content-addressed offline cache. Game projects do not copy or fork engine source.

A JSON5 authoring model describes rooms, nested item collections and flat capabilities. A deterministic normalization step supplies defaults and validates structure before producing canonical runtime schema 1. The Node builder emits JSON for the deployed client, keeping the JSON5 parser out of the browser. Runtime state is separate from the cloned world definition and remains serializable, supporting alternate views and headless replays. Generic mission and transport state machines use data-defined routes and phases; a particular story registers their triggers and consequences.

Game worlds, story scripts, artwork and story-specific tests belong in independent game repositories. The platform includes a small study example. Its unit tests and packed-consumer tests run without any external game checkout.

See [API](api.md) for authoring and [releases](releases.md) for compatibility commitments.
