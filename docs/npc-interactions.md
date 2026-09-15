# Talking to NPCs and giving items

An NPC is an ordinary object with an `npc` configuration. Every accessible NPC
offers Talk; a directly carried item offers Give to each accessible NPC. The
browser uses the engine's ordinary action-menu results.

## Model

```json5
courier: {
  name: 'Courier',
  prose: {
    greeting: 'Good morning. Do you have a delivery?',
    acceptedLetter: 'I will deliver it.',
  },
  npc: {
    talk: {
      label: 'Talk to',
      title: 'Conversation',
      message: 'The courier has nothing to add.',
    },
    give: {
      label: 'Give to',
      title: 'Offer',
      message: 'The courier does not want that.',
    },
    inventory: {
      badge: {name: 'Badge', description: 'A brass badge.'},
    },
  },
}
```

All three NPC fields are optional. Without response configuration, Talk says that
the character has nothing to say; Give says they do not want the offered item.
These refusals do not transfer anything, mark success or spend a turn. Model
`message`, `title` and `label` fields override the fallback text for translation.

The Give label is a prefix: the browser menu appends the recipient's name.
Game-specific accepted dialogue belongs in the owning object's `prose` catalog.

## Dispatch

```js
game.dispatch({type: 'talk', target: 'courier'});
game.dispatch({type: 'give', target: 'letter', secondaryTarget: 'courier'});
```

The player is the action's actor. The NPC is the Talk target or Give recipient.
Give requires a directly carried, accessible item and an accessible NPC. A worn
item or an item inside a bag must be taken into direct carrying first. Connected
items must be disconnected before giving. Hidden or out-of-reach NPCs cannot
receive either action. An object cannot be given to itself or to an NPC nested
inside that object.

These are scope checks before story replacement rules. Availability is checked
both for menus and dispatch, including stale requests:

```js
game.available('talk', 'courier', ctx => !ctx.target.properties.busy);
```

Use a before rule to explain an unusual in-scope refusal. Default refusal handlers
do not commit, so they do not trigger after rules.

## Supply dialogue and accept an item

```js
import {HANDLED, STOP} from '@paulbowler/if-engine';

export function register(game) {
  game.instead('talk', 'courier', ctx => {
    ctx.say(ctx.target.prose.greeting);
    ctx.set('courier', 'properties.met', true);
    ctx.commit(); // This conversation costs one turn.
    return HANDLED;
  });

  game.instead('give', {
    target: 'letter',
    secondaryTarget: 'courier',
  }, ctx => {
    if (!game.transferToNpc(ctx.action.target, ctx.action.secondaryTarget)) {
      return STOP;
    }
    ctx.say(ctx.secondaryTarget.prose.acceptedLetter);
    ctx.commit();
    return HANDLED;
  });
}
```

Other offered items still reach the standard refusal. Use `ctx.commit(false)`
for a successful free interaction. An instead replacement owns its consequences:
standard after rules do not run for it.

`game.transferToNpc(itemID, recipientID)` returns a boolean. It rechecks ordinary
possession, accessibility and ownership constraints, moves the item, and emits
`itemGiven` with `{item, recipient}` only when the transfer succeeds. The existing
`itemMoved` event is emitted first. Both listeners see the new ownership. This
helper does not commit a turn, save or select acceptance prose. It does not run
availability/before/instead rules: call it from the dispatched accepting rule.

## NPC possessions

Author inventory as nested object definitions under `npc.inventory`.
Normalization places it at `object.properties.npc.inventory` and normalizes its
contents like other objects. The collection is absent until supplied or first
used; treat absence as empty.

There is one owner per item. Giving moves the original object and its contents;
it does not copy them. Inventory moves with the NPC and survives save/load.
Possessions and nested contents can be found by ID, described by controller
queries, and have timers, but ordinary player examination/taking/using cannot
reach them. An NPC does not become a public container.

`game.findItem(id)` reports immediate owner `{type: 'npc', key: npcID, ...}` for
direct possessions, with `accessible: false`. A nested bag's child has that bag
as its immediate owner and remains inaccessible and not player-owned.

For a scripted return or transfer, use the existing mutation API:

```js
ctx.move('letter', {type: 'carried'});
ctx.move('badge', {type: 'npc', item: 'courier'});
```

These are controller mutations, not attempted player Give actions. They do not
run social rules, emit `itemGiven`, or commit by themselves. They retain normal
duplicate-ownership and containment-cycle protections.

## Query API and limits

- `game.canTalkTo(npcID)`: ordinary target scope, excluding story availability.
- `game.canGiveTo(itemID, npcID)`: ordinary giving constraints, excluding story availability.
- `game.getGiveTargets(itemID)`: eligible `{key, item}` recipients including registered Give availability.
- `game.getAvailableActions(id)`: normal browser menu controls, including Talk/Give.

These queries are read-only and do not perform conversations or gifts.
The engine does not infer friendship, acceptance conditions, conversation topics,
bartering, or NPC instructions. Build story-specific conversations with existing
named choices, rules and model prose.

See the [attribute reference](model-attributes.md#npc), [schema guide](schema.md),
and [engine lifecycle](engine-lifecycle.md) for configuration and callback ordering.
