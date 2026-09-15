# How the engine runs your game

This guide follows a game from initialization through menus, player actions,
world reactions and saving. Read it alongside the [tutorial](tutorial.md);
the [API reference](api.md) lists the supported methods and context fields.

## 1. Load the model and register the controller

The JSON5 model contains world structure, initial facts and translatable prose.
The loader normalizes it and the engine creates mutable runtime state. Your game
factory then calls the controller modules:

```js
import {createGame} from '@paulbowler/if-engine';
import {register as registerLocks} from './logic/locks.js';

export function createMyGame(world, options = {}) {
  const game = createGame(world, options);
  registerLocks(game);
  return game;
}
```

A function named `register` is an ordinary exported JavaScript function. The
engine does not discover or call it automatically; your factory calls it.

Inside that function, calls such as `game.available`, `game.before` and
`game.describe` store callbacks for the engine to call later. A callback is simply
a function passed to another function. Passing `ctx => ...` does not execute its
body immediately.

Register callbacks once for each new engine instance. They receive current
state when called, so they can respond to changes without being registered again.
Keep each mechanic's action rules, text selectors and report configuration in
the same module. The model owns the actual wording.

## 2. Query what the player can see and do

The view asks the engine for descriptions and interaction options. These queries
can happen repeatedly, without the player taking a turn.

The engine derives ordinary actions from capabilities and accessibility, then
applies the controller's availability checks where appropriate. These queries
do not run before/instead/after action rules.

```js
game.available('take', 'parcel', ctx => {
  return ctx.target.properties.ready === true;
});
```

This registers a check for taking the parcel. It does not take the parcel or
change its state.

| Callback result | During menu construction | During action dispatch |
| --- | --- | --- |
| `true` | Allows this candidate through this check; ordinary restrictions still apply | Allows processing to continue; other rules and standard semantics may still prevent success |
| `false` | Excludes this candidate from menus that query this availability | Stops processing before instead rules and the standard handler |
| Anything else | Throws an error | Throws an error |

If several checks match, every one must return `true`; evaluation stops at the
first `false`. If no checks match, availability defaults to `true`. That default
does not grant missing capabilities, make an inaccessible object reachable, or
implement an unsupported action.

`game.available(type, match, callback)` registers a check.
`game.isAvailable(request)` evaluates the registered checks. The latter is not
a complete simulation of whether an action will succeed.

Callbacks must be synchronous and return a boolean. Keep them read-only: do not
change state, show messages, emit events, spend turns or consume randomness.
They are trusted JavaScript callbacks, not a sandbox that prevents those mistakes.

A match can be a target ID, a matching function, or an object containing
`target`, `secondaryTarget` and/or `when`. A false `when` means “this rule does
not apply”; a false callback result means “this matching rule blocks eligibility.”

## Example: locks controlled by other interactions

```js
const specialLocks = ['codedDoor', 'electronicSafe'];

export function register(game) {
  for (const id of specialLocks) {
    game.available('lock', id, () => false);
    game.available('unlock', id, () => false);
  }
}
```

When your factory calls `register(game)`, the loop registers two callbacks per
object. Each `() => false` is a function that always returns false and needs no
context argument.

The result is:

- Ordinary Lock and Unlock options are not offered for these objects.
- Directly dispatching those actions is also blocked by availability.
- The callbacks do not alter the objects' current locked/unlocked state.
- Other actions can still change that state: using a card, submitting a code or
  operating a tool can have their own rules.
- An `instead('unlock', ...)` rule will not override this veto, because
  availability is checked before instead rules.

This configuration disables two ordinary verbs, not all possible ways of opening
the objects. Use it only when that is the intended mechanic.

## 3. Dispatch a player intention

A click becomes a structured request:

```js
const result = game.dispatch({
  type: 'take',
  actor: 'player',
  target: 'parcel',
});
```

The dispatcher validates and normalizes the request, resolves named choices and
constructs a context containing the action, current entities, room, world and
state. Invalid request shapes throw; unsupported or out-of-scope interactions
stop. Game-over and pending-message guards can stop a request before action rules.

For an eligible request, the main flow is:

```text
Request validation and scope checks
    |
BEFORE rules
    |
Availability checks
    |
INSTEAD rules
    |
Standard action
    |
AFTER rules at a successful standard action's commit
    |
World consequences, view/save hooks and action feedback
    |
REPORT rules and returned result
```

Scope checks may themselves query availability, particularly for travel. Do not
assume a before rule always runs, or that an availability callback runs only once.

| Registration | Purpose | Return value |
| --- | --- | --- |
| `before` | Explain or handle unusual prerequisites before normal processing | `CONTINUE`, `STOP`, `HANDLED`, or omit for continuation |
| `available` | Answer whether this action is eligible now | Boolean |
| `instead` | Replace the standard interaction | Usually `HANDLED`; `CONTINUE` leaves normal processing available |
| `after` | Add consequences to a successful standard action | Usually omit; not a way to undo the action |
| `report` | Inspect or adjust the result and feedback | Usually omit |

Action rules use the explicit constants exported by the engine; boolean results
are invalid for them. `STOP` stops the main pipeline. `HANDLED` bypasses normal
processing; it does not automatically mark the action successful. Rules within
each phase run in registration order.

An availability refusal does not supply an explanation by itself. Use a before
rule with `ctx.say(...)` and `STOP` when an in-scope attempted action needs an
explanation. Report rules can also inspect a stopped result. Very early dispatch
rejections return without running report rules.

## 4. Commit changes and advance the world

Standard actions perform their own commits. A custom replacement uses
`ctx.commit()` to mark success and spend a turn, or `ctx.commit(false)` for a
successful change without advancing time. Reporting a refusal requires no commit.

After rules run at the successful standard action's commit boundary, before its
turn consequences. They do not run for an instead replacement. A free examination
can still commit and run after rules. An after rule can charge that discovery a
turn; one dispatch does not advance time twice through repeated commits.

At a commit, the engine normalizes player state, advances elapsed minutes when
appropriate, publishes state checks, checks endings, and advances turn-based
world behaviour if play continues. Transport progression, entity timers and
missions run before scheduled events due on that turn. The engine then updates
observations and actor cues, checks endings again, and invokes view/save hooks.

A commit without time advancement still performs state and ending checks.
If play has ended, the engine publishes the final state without advancing its
timers. A blocked request spends no turn automatically.

Events describe facts, while actions describe attempted interactions. Event
listeners run synchronously when an event is emitted; emissions made inside a
listener queue behind the current event. Events are not all deferred until after
an action. For delayed facts, use named scheduled events with serializable payloads:

```js
game.events.on('courierReturns', () => {
  // Apply this mechanic's consequences using current game state.
});

game.schedule.afterTurns(3, 'courierReturns');
```

The delay counts future scheduler advances, not wall-clock seconds. Scheduling
during an action before that action's scheduler advance includes that advance
in the count. Callbacks are synchronous; nested action dispatch is rejected.
Use events for reactions.

## 5. Select text and render feedback

Descriptions use callbacks too:

```js
game.describe('parcel', ctx => {
  if (ctx.target.properties.ready) return 'ready';
  return 'default';
});
```

The returned IDs select text authored on that entity. This callback does not change
the parcel. It derives its description from current facts whenever queried.

Availability is also used for individual text, image, cue and exit-variant
candidates. For these query types, `true` means eligible content and `false`
means omit this candidate; neither result executes a player action. The consumer
determines whether to select the first eligible variant or combine eligible
passages. Use `game.describe` when directly selecting description IDs.

The browser renders the current state and engine feedback. Commit hooks can
refresh it during dispatch; not everything waits until dispatch returns.
The returned result includes status, success, messages and any action value.
A free query can return useful text without `success: true`.

## 6. Save, restore and repeat

`game.save()` returns serializable mutable state, including scheduled work.
Callback functions are controller configuration and are not saved.

To restore in a fresh process, load the same model, create the engine, register
its controller modules, and call `game.load(saved)`. When loading into an existing
configured engine, its registrations remain. Reacquire entity references after
loading: the engine replaces state objects.

Read-only selectors then derive current descriptions and eligibility from the
restored facts. No browser-specific state or re-registration is needed for each
turn. The next player intention begins the dispatch lifecycle again.

Exceptions in controller callbacks do not roll back arbitrary state mutations.
For the detailed API and supported save schemas, see the [API reference](api.md).
