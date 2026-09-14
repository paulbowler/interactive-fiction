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

The world schema retains nested rooms, item collections and capability properties. Runtime state is separate from the cloned world definition and remains serializable. This preserves the original implementation's mechanics while permitting other views and headless replays. Generic mission and transport state machines use data-defined routes and phases; a particular story registers their triggers and consequences.

The King's Diamond's world, bespoke scripts, original reference implementation and browser playtests live in its independent repository. The platform includes only an unrelated small study example. Platform unit and packed-consumer tests run without the King's Diamond checkout.

See [API](api.md) for authoring and [releases](releases.md) for compatibility commitments.
