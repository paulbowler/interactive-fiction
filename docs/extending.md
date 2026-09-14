# Extending a game or the platform

Use the [feature reference](feature-reference.md) to check the existing semantics before adding a new field. A stored property does not automatically add an interaction, menu option, validator, or renderer.

## Choose the extension boundary

| Desired change | Place to implement it |
| --- | --- |
| Ordinary room, object, connection, container or key | JSON5 world model |
| New prose, illustration, achievement or ending | World definition; register a rule for when progress occurs |
| Exceptional restriction or consequence | `before` / `after` rule |
| Replacement interaction | `instead` rule returning `HANDLED` or `STOP` |
| Delayed reaction | Event listener plus `schedule.afterTurns` |
| New small puzzle phase sequence | Serializable state and explicit transitions in the controller |
| New action specific to one story | Controller `registerAction` plus a view intention/control |
| Reusable capability needed by multiple games | Engine handler, normalization/validation, API documentation and focused tests |
| Different visual controls or layout | View or custom browser template, preserving dispatch semantics |

The engine must not import a game controller. A controller imports the engine; a view receives the configured game. Keep basic topology inspectable in the world and keep arbitrary executable behavior out of JSON5.

## Add a controller action

For example, a game might let players polish a directly carried object:

```js
import { createGame } from '@paulbowler/if-engine';

const game = createGame({
  title: 'The Workshop',
  player: { room: 'workshop', carried: {
    silverCup: { name: 'Silver Cup', portable: true, polishable: true, polished: false },
  } },
  rooms: { workshop: { name: 'Workshop' } },
});

game.registerAction('polish', ctx => {
  const location = ctx.game.findItem(ctx.action.target);
  if (!location || !ctx.game.canActOnItem(ctx.action.target) ||
      !ctx.game.isDirectlyCarriedLocation(location) ||
      !location.item.properties.polishable || location.item.properties.polished) {
    ctx.say('You cannot polish that now.');
    return;
  }
  ctx.set(ctx.action.target, 'properties.polished', true);
  ctx.emit('objectPolished', { item: ctx.action.target });
  ctx.say('It shines.');
  ctx.commit();
});

game.dispatch({ type: 'start' });
game.dispatch({ type: 'polish', target: 'silverCup' });
```

Author eligible objects with `portable:true, polishable:true, polished:false`. These are custom fields until your controller handles them. Dispatch `{type:'polish', target:'silverCup'}` from a custom control. `registerAction` does **not** automatically add a standard browser item-menu button. For a standard choice button, install a `choices` entry with a registered script performing the same reusable mutation, rather than dispatching recursively from a script.

A normal registered handler commits its mutation to report success and run after rules. In an **instead rule**, return `HANDLED` after making and committing the replacement mutation. `STOP` blocks a rule pipeline. Avoid nested dispatch; emit events for consequences. Event listeners and rule callbacks are synchronous.

Reacquire `game.state` and `findItem` results inside callbacks; load replaces the state object. A closure may retain IDs and immutable configuration, but essential progress belongs in saved state. Register the same handlers/scripts for every runtime before loading.

## Promote a capability into the reusable engine

1. Define its public authoring fields, native types, defaults, implications and interactions with existing traits. Keep new fields optional for compatible v1 updates. Decide whether a field is merely descriptive metadata or changes standard semantics.
2. Add normalization in `packages/engine/src/normalise-world.js` if canonical placement/defaults need it. Ensure new references and invalid combinations fail clearly. Do not reapply initial defaults over saved mutable state.
3. Implement semantics in `src/actions.js` or a small focused engine module. Register the canonical action in `src/dispatcher.js` if new. Keep reachability, inventory, locking and turn cost consistent.
4. Update `getAvailableActions` and relevant target/query helpers in `src/game.js` when the default browser should offer it. The view's action IDs must map to dispatcher intentions; a visible button is not a substitute for semantic checks.
5. Add view rendering only for new presentation needs. Update templates/styles if a new control requires them. Keep story conditions out of the view.
6. Extend `validateWorld` for canonical configured state and saves, in addition to authoring validation. Preserve valid format-1 saves and package/version independence. A future client should be able to query and dispatch without the browser.
7. Add focused tests for a successful use, blocked/repeated uses, containment/accessibility, turn cost and save/restore. Include an unrelated small world and a meaningful consumer replay for changes affecting established semantics.
8. Update [World authoring](world-model.md), [Feature reference](feature-reference.md), [API](api.md), examples and changelog. Follow the [release procedure](releases.md); do not overwrite published archive bytes.

The modules are plain JavaScript. There is no need for a new schema DSL, state-machine library, dependency-injection framework or external event bus to add a capability.

## Extension checks that catch subtle regressions

- Exit conditions block on true; ordinary visibility/availability conditions allow on true. Include explicit blocker messages.
- Scenery affects listing; hidden affects interaction. A fixed object is not portable.
- Owned, directly carried and accessible are different. Transparent containers expose accessible contents; ordinary placement still requires an open destination.
- Look/examine are normally free, but Read and recording notes cost turns. A custom mutation must commit exactly once.
- After rules run before the current action's timed world updates. A timer and a scheduled event do not have identical first-turn semantics.
- Runtime paths differ from flat authoring paths. Conditions use paths relative to `properties`; `ctx.set` uses a full object-relative path including `properties`.
- `enterText` takes the note ID first and device ID second. Key-based Unlock takes the locked object first and key second.
- Check duplicate IDs, reverse exits, actor transport queues, pending acknowledgements and restoration during an active sequence when relevant.

This guide covers extension points, not a promise that every stored property is a built-in feature. Record the meaning of new story flags in that game's own documentation; promote them into this reference only when the platform itself implements them.
