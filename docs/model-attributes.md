# Model attributes

This is the field-by-field companion to the [feature reference](feature-reference.md).
It is generated from [world.schema.json](../packages/engine/world.schema.json).
Edit schema field descriptions, then run `node scripts/document-world-schema.js`.

Required means required **inside that element**, not that every world must contain
that element. For example, readable.text is required only when readable is declared.
Optional fields without a listed default remain absent; a capability being absent
means it is disabled. Defaults describe engine behaviour, not values inserted by
the schema validator. Some defaults are interpreted when used rather than stored.
If a controller compares a story flag with === false, author that initial false
explicitly: an absent property remains distinct from false.

Only title, player (with room) and rooms are universally required. Object fields
are composable: to declare a container, set container: true. Neither name nor
description is enforced, but provide them for meaningful player-facing content.

Additional fields on worlds, rooms, objects, scenery, players, actors and mission
destinations are allowed for game-specific JSON state. They have no implicit
engine meaning. Other structured records reject unknown attributes. Reserved
executable program fields are rejected recursively. Runtime fields and
controller-only configuration are documented below for inspection, not as a
requirement to populate bookkeeping in a new world.

## Find an element

- [world](#world)
- [items](#items)
- [idList](#idlist)
- [player](#player)
- [room](#room)
- [exit](#exit)
- [scenery](#scenery)
- [object](#object)
- [description](#description)
- [text](#text)
- [paragraphs](#paragraphs)
- [prose](#prose)
- [imagePosition](#imageposition)
- [startScreen](#startscreen)
- [achievement](#achievement)
- [ending](#ending)
- [encounter](#encounter)
- [clock](#clock)
- [clockNotice](#clocknotice)
- [clockDeadline](#clockdeadline)
- [wearable](#wearable)
- [insertion](#insertion)
- [connectable](#connectable)
- [connection](#connection)
- [readable](#readable)
- [searchable](#searchable)
- [pushable](#pushable)
- [pullable](#pullable)
- [climbable](#climbable)
- [pressable](#pressable)
- [edible](#edible)
- [tool](#tool)
- [cuttable](#cuttable)
- [toolOption](#tooloption)
- [passage](#passage)
- [record](#record)
- [choice](#choice)
- [choiceOption](#choiceoption)
- [input](#input)
- [npc](#npc)
- [talkResponse](#talkresponse)
- [giveResponse](#giveresponse)
- [missions](#missions)
- [missionStates](#missionstates)
- [routeEdge](#routeedge)
- [missionDestination](#missiondestination)
- [transport](#transport)
- [transportSpace](#transportspace)
- [transportStop](#transportstop)
- [beforeMove](#beforemove)
- [imageVariant](#imagevariant)
- [cue](#cue)
- [exitVariant](#exitvariant)
- [movementCue](#movementcue)
- [turnCue](#turncue)
- [actorCueVariant](#actorcuevariant)
- [missionVariant](#missionvariant)
- [predicateReference](#predicatereference)
- [transportRequest](#transportrequest)
- [timer](#timer)
- [runtime](#runtime)
- [scheduledEvent](#scheduledevent)

## Capability combinations

- `container: true` enables holding objects. It does not imply opening or visibility.
- An always-open basket needs `container: true, opened: true`. An openable box
  needs `container: true, openable: true` and starts closed unless opened is true.
- `supporter: true` supplies holding and opened true. Do not add openable,
  lockable, locked, door, or opened false.
- Opening/locking fields require a container, supporter or door. Holding fields
  (items, accepts, insertable, transparent, takeLabel) require a container/supporter.
- `locked: true` and key require `lockable: true`. A locked object cannot start
  opened. Lockable does not itself imply openable.
- Fixed and explicitly portable cannot both be true. Container and door cannot
  both be true. An opened door requires openable.
- Contents have one owner: nested items, room items or player inventory. Do not
  add a second location attribute.
- transparent exposes closed contents for both viewing and taking. Ordinary
  placement still needs opened. There is no built-in weight or capacity limit.

## Container example

```json5
chest: {
  name: 'Chest',
  container: true,
  openable: true,
  lockable: true,
  locked: true,
  key: 'brassKey',
  items: {
    letter: {name: 'Letter', portable: true, description: 'Meet me at dusk.'},
  },
}
```

Declare brassKey elsewhere as an object. Unlock does not also open the chest.
Use a controller report rule to customize container lock/unlock feedback;
lockMessage and unlockMessage customize doors only.

## world

JSON5 authoring model before normalization. Custom state is allowed; engine relationship validation runs after schema validation.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `title` | string | Yes | Not supplied | Game title. |
| `id` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `version` | string | No | "1" | Story compatibility version. |
| `schemaVersion` | `2` | No | Not supplied | Optional world schema identifier; independent of package version. |
| `player` | [player](#player) | Yes | Not supplied | Player initial state; owned objects are definitions, not lists of IDs. |
| `rooms` | dictionary of [room](#room) | Yes | Not supplied | Room definitions; must contain player.room. |
| `items` | [items](#items) | No | Not supplied | Prototypes for later creation; absent means empty. |
| `startScreen` | [startScreen](#startscreen) | No | Not supplied | Opening screen; omitted world field becomes a screen with the world title. |
| `achievements` | dictionary of [achievement](#achievement) | No | Not supplied | Definitions keyed by achievement ID; absent means empty. |
| `endings` | array of [ending](#ending) | No | Not supplied | Ending definitions; absent means empty. |
| `clock` | [clock](#clock) | No | Not supplied | Optional clock controls; timed actions still cost minutes without this object. |
| `transports` | dictionary of [transport](#transport) | No | Not supplied | Physical transports; absent means none. |
| `prose` | [prose](#prose) | No | Not supplied | Entity-owned named prose; no automatic fallback between owners. |
| `actors` | Not supported | Forbidden | Not supplied |  |
| `runtime` | Not supported | Forbidden | Not supplied |  |

## items

Object definitions keyed by persistent ID; nested declarations establish ownership.

Type: dictionary of [object](#object).

## idList

Persistent object IDs.

Type: array of string.

## player

Player initial state; owned objects are definitions, not lists of IDs.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `room` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `elapsedMinutes` | integer | No | 0 | Initial elapsed time. |
| `carried` | [items](#items) | No | Not supplied | Object definitions keyed by persistent ID; nested declarations establish ownership. |
| `worn` | [items](#items) | No | Not supplied | Object definitions keyed by persistent ID; nested declarations establish ownership. |
| `visitedRooms` | dictionary of `true` | No | Not supplied | Optional previously visited room IDs; current room is marked on initialization. |
| `currentRoom` | Not supported | Forbidden | Not supplied |  |

## room

Room definition; name and description recommended, empty items/exits inferred.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `name` | string | No | Not supplied | Display name; recommended for objects shown to players. |
| `description` | [description](#description) | No | Not supplied | String or named text alternatives. Alternatives require default; selectors return IDs. |
| `prose` | [prose](#prose) | No | Not supplied | Entity-owned named prose; no automatic fallback between owners. |
| `imageUrl` | string | No | Not supplied | Local image asset path. Object images do not automatically get a separate browser panel. |
| `imagePosition` | [imagePosition](#imageposition) | No | Not supplied | Image crop alignment. |
| `items` | [items](#items) | No | Not supplied | Object definitions keyed by persistent ID; nested declarations establish ownership. |
| `exits` | dictionary of [exit](#exit) | No | Not supplied | Destination room IDs mapped to exits. |
| `scenery` | dictionary of [scenery](#scenery) | No | Not supplied | Room-local features; IDs cannot contain a colon. |
| `clues` | Not supported | Forbidden | Not supplied |  |

## exit

Connection keyed by destination room ID. Empty definition is valid.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `before` | string | No | Not supplied | Text before destination link; default wording describes an exit. |
| `after` | string | No | Not supplied | Text after destination link. |
| `label` | string | No | Not supplied | Overrides linked destination room name. |
| `description` | string | No | Not supplied | Optional wording used to derive display parts; prefer before/after. |
| `listed` | boolean | No | true | Include in automatic exit list; does not remove topology. |
| `door` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `standingOn` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `successMessage` | string | No | Not supplied | Display text. |
| `successTitle` | string | No | "Done" | Immediate travel feedback heading. |
| `deferMoveUntilMessageClosed` | boolean | No | false | Complete travel after acknowledgement. |
| `beforeMove` | [beforeMove](#beforemove) | No | Not supplied | Pre-travel acknowledgement message. |

## scenery

Room-local examinable feature. Use an ordinary object for other actions.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `name` | string | No | Not supplied | Inline name; falls back to title, then ID. |
| `title` | string | No | Not supplied | Examination heading; falls back to name, then Examine. |
| `description` | [description](#description) | No | Not supplied | String or named text alternatives. Alternatives require default; selectors return IDs. |
| `prose` | [prose](#prose) | No | Not supplied | Entity-owned named prose; no automatic fallback between owners. |
| `examined` | boolean | No | false | Examination progress; engine sets true when examined. |

## object

Composable flat capabilities. ID comes from the collection key. No object fields are universally required; name and description are recommended. Additional JSON fields are explicit game state.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `name` | string | No | Not supplied | Display name; recommended for objects shown to players. |
| `description` | [description](#description) | No | Not supplied | String or named text alternatives. Alternatives require default; selectors return IDs. |
| `prose` | [prose](#prose) | No | Not supplied | Entity-owned named prose; no automatic fallback between owners. |
| `imageUrl` | string | No | Not supplied | Local image asset path. Object images do not automatically get a separate browser panel. |
| `id` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `article` | string | No | Not supplied | Grammatical article, such as a, an or the. |
| `detail` | string | No | Not supplied | Display text. |
| `portable` | boolean | No | false | Allows taking accessible objects. |
| `fixed` | boolean | No | false | Prevents taking; cannot combine with portable true. |
| `hidden` | boolean | No | false | Hidden object and its contents are inaccessible. |
| `scenery` | boolean | No | false | Suppress automatic object listing; still supports ordinary actions. |
| `droppable` | boolean | No | true | Allow dropping a carried item. |
| `requiresHeld` | boolean | No | false | Most uses require direct carrying. |
| `retain` | boolean | No | false | Keep held after special insertion/swipe. |
| `weight` | number | No | Not supplied | Controller data only; no built-in capacity limit. |
| `container` | boolean | No | false | Enable containment; does not imply openable or opened. |
| `supporter` | boolean | No | false | Enable visible holding; implies opened true. |
| `door` | boolean | No | false | Door state used by exits; incompatible with container/supporter. |
| `openable` | boolean | No | false | Offer opening/closing; requires container, supporter or door. |
| `opened` | boolean | No | Not supplied | Initial open state: omitted becomes false for openable objects, true for supporters, otherwise remains absent. A non-openable container needs opened true to expose contents. |
| `lockable` | boolean | No | false | Support locking/unlocking; does not imply openable. |
| `locked` | boolean | No | false | Initial lock state; requires lockable true and cannot combine with opened true. |
| `key` | string | No | Not supplied | Key object ID; requires lockable true. Omitted means keyless manual locking/unlocking. |
| `items` | [items](#items) | No | Not supplied | Object definitions keyed by persistent ID; nested declarations establish ownership. |
| `accepts` | array of string | No | Not supplied | Ordinary placement whitelist. Omitted or * allows any item; [] allows none. |
| `transparent` | boolean | No | false | Closed contents are visible AND accessible; ordinary Put still needs opened. |
| `takeLabel` | string | No | Not supplied | Removal label; Take for supporters, Take Out for containers. |
| `insertable` | dictionary of [insertion](#insertion) | No | Not supplied | Item IDs mapped to insertion/swipe controls; overrides ordinary placement for that item. |
| `openMessage` | string | No | Not supplied | Optional feedback; ordinary engine wording when omitted. |
| `closeMessage` | string | No | Not supplied | Optional feedback; ordinary engine wording when omitted. |
| `lockedMessage` | string | No | Not supplied | Optional feedback; ordinary engine wording when omitted. |
| `lockMessage` | string | No | Not supplied | Door feedback override. Container handlers use standard feedback; change it with a report rule. |
| `unlockMessage` | string | No | Not supplied | Door feedback override. Container handlers use standard feedback; change it with a report rule. |
| `wearable` | boolean or [wearable](#wearable) | No | Not supplied | Boolean true enables wearing, or use removal settings. |
| `connectable` | [connectable](#connectable) | No | Not supplied | Connection capability; movement disconnects owned objects. |
| `readable` | [readable](#readable) | No | Not supplied | Enables Read, which consumes one turn; does not set a read flag. |
| `searchable` | [searchable](#searchable) | No | Not supplied | Search capability; sets searched and consumes a turn. |
| `pushable` | [pushable](#pushable) | No | Not supplied | Push capability; sets pushed true. |
| `pullable` | [pullable](#pullable) | No | Not supplied | Resets this object’s pushable.pushed state. Requires it to be pushed. |
| `climbable` | [climbable](#climbable) | No | Not supplied | Standing-on capability; ordinary movement requires climbing down unless the exit declares standingOn. |
| `pressable` | [pressable](#pressable) | No | Not supplied | Enables Press; effects belong in rules, except a declared transport control. |
| `edible` | [edible](#edible) | No | Not supplied | Eating reports outcomeText; consumed controls deletion and turn cost. |
| `tool` | [tool](#tool) | No | Not supplied | Held tool capable of named operations. |
| `cuttable` | [cuttable](#cuttable) | No | Not supplied | Target of named tool operations. |
| `input` | [input](#input) | No | Not supplied | Text input control; submitInput rules handle acceptance. |
| `passage` | [passage](#passage) | No | Not supplied | Enter interaction using the current room’s declared exit. |
| `npc` | [npc](#npc) | No | Not supplied | An actor is an ordinary object with npc configuration, not a separate top-level collection. |
| `turnable` | boolean | No | false | Enable Turn On/Off. |
| `turnedOn` | boolean | No | false | Initial switch state; does not enable switching alone. |
| `choices` | array of [choice](#choice) | No | Not supplied | Named controls; omitted means none. |
| `recordable` | [record](#record) or array of [record](#record) | No | Not supplied | One or more notebook recording choices. |
| `textValue` | string | No | Not supplied | Recorded input value; controllers may compare against it. |
| `textInputLabel` | string | No | "Enter into" | Note-to-device action label. |
| `textInputTargets` | [idList](#idlist) | No | Not supplied | Permitted device IDs; omit to allow reachable configured devices. |
| `properties` | Not supported | Forbidden | Not supplied |  |
| `location` | Not supported | Forbidden | Not supplied |  |
| `transport` | Not supported | Forbidden | Not supplied |  |

## description

String or named text alternatives. Alternatives require default; selectors return IDs.

Type: string or dictionary of string or array of object.

## text

Unconditional string, or ordered strings/named segments. Controller selects named segments; no code is evaluated.

Type: string or array of string or object.

## paragraphs

String or array of paragraphs; a paragraph may itself contain named segments.

Type: string or array of [text](#text).

## prose

Entity-owned named prose; no automatic fallback between owners.

Type: dictionary of string or array of string.

## imagePosition

Image crop alignment.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `x` | string | No | "center" | Horizontal alignment. |
| `y` | string | No | "center" | Vertical alignment. |

## startScreen

Opening screen; omitted world field becomes a screen with the world title.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `title` | string | No | Not supplied | Heading; falls back to world title. |
| `kicker` | string | No | Not supplied | Short text above heading; falls back to subtitle. |
| `subtitle` | string | No | Not supplied | Display text. |
| `text` | [paragraphs](#paragraphs) | No | Not supplied | String or array of paragraphs; a paragraph may itself contain named segments. |
| `description` | [paragraphs](#paragraphs) | No | Not supplied | Fallback for absent text. |
| `buttonLabel` | string | No | "Start" | Start button label. |
| `imageUrl` | string | No | Not supplied | Local image asset path. |
| `imagePosition` | [imagePosition](#imageposition) | No | Not supplied | Image crop alignment. |

## achievement

Definition keyed by achievement ID. Controller explicitly awards it.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `name` | string | No | Not supplied | Display text. |
| `description` | string | No | Not supplied | Display text. |

## ending

Ending definition. Selected by a controller or clock.deadline.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `title` | string | No | Not supplied | Heading; falls back to name. |
| `name` | string | No | Not supplied | Display text. |
| `kicker` | string | No | Not supplied | Display text. |
| `text` | [paragraphs](#paragraphs) | No | Not supplied | String or array of paragraphs; a paragraph may itself contain named segments. |
| `imageUrl` | string | No | Not supplied | Local image asset path. |
| `imagePosition` | [imagePosition](#imageposition) | No | Not supplied | Image crop alignment. |
| `encounter` | [encounter](#encounter) | No | Not supplied | Message shown before an ending; acknowledgement reveals the ending screen. |

## encounter

Message shown before an ending; acknowledgement reveals the ending screen.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `description` | [text](#text) | No | Not supplied | Unconditional string, or ordered strings/named segments. Controller selects named segments; no code is evaluated. |

## clock

Optional clock controls; timed actions still cost minutes without this object.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `startTime` | string | No | Not supplied | Starting time of day in 24-hour HH:MM format (for example 09:30). The displayed clock adds elapsed minutes and wraps at midnight. Omit to display elapsed duration; timers and notice thresholds always use elapsed minutes. |
| `minutesPerTurn` | integer | No | 1 | Minutes per timed commit. |
| `notices` | array of [clockNotice](#clocknotice) | No | Not supplied | Threshold notices; omitted means none. |
| `deadline` | [clockDeadline](#clockdeadline) | No | Not supplied | Optional failure at the next occurrence of a time of day after clock.startTime; requires clock.startTime. Equal start and deadline times allow 24 hours. |

## clockNotice

Message when elapsed minutes cross a threshold.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `minute` | integer | Yes | Not supplied | Positive minute threshold. |
| `text` | [text](#text) | Yes | Not supplied | Unconditional string, or ordered strings/named segments. Controller selects named segments; no code is evaluated. |

## clockDeadline

Optional failure at the next occurrence of a time of day after clock.startTime; requires clock.startTime. Equal start and deadline times allow 24 hours.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `time` | string | Yes | Not supplied | Deadline time in 24-hour HH:MM format. |
| `ending` | string | Yes | Not supplied | ID of an existing ending to trigger when the deadline is reached or passed. |

## wearable

Wear/remove settings. Boolean true also enables wearing.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `removable` | boolean | No | true | Permit removal. |
| `removeMessage` | string | No | Not supplied | Feedback when removal is refused; ordinary refusal when omitted. |

## insertion

Special insertion/swipe for the item ID used as dictionary key.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `label` | string | No | "Insert into" | Verb prefix. |
| `retain` | boolean | No | false | Leave item held after use; the held object retain flag also applies. |

## connectable

Connection capability; movement disconnects owned objects.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `targets` | dictionary of [connection](#connection) | Yes | Not supplied | Object IDs mapped to connection settings. |

## connection

One connection target, keyed by object ID.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `connected` | boolean | No | false | Initial connection state; connecting clears other targets. |
| `label` | string | No | Not supplied | Display text. |
| `disconnectLabel` | string | No | Not supplied | Display text. |
| `message` | string | No | Not supplied | Display text. |
| `disconnectMessage` | string | No | Not supplied | Display text. |
| `title` | string | No | Not supplied | Display text. |
| `disconnectTitle` | string | No | Not supplied | Display text. |
| `disconnected` | boolean | No | false | Initial progress flag set by disconnection. |

## readable

Enables Read, which consumes one turn; does not set a read flag.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `text` | [text](#text) | Yes | Not supplied | Unconditional string, or ordered strings/named segments. Controller selects named segments; no code is evaluated. |
| `noteSources` | [idList](#idlist) | No | Not supplied | Recording sources offered in the reading dialog; omitted means none. |

## searchable

Search capability; sets searched and consumes a turn.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `once` | boolean | No | false | Prevent repeat searches. |
| `searched` | boolean | No | false | Initial search progress. |
| `message` | string | No | Not supplied | Display text. |
| `title` | string | No | Not supplied | Display text. |

## pushable

Push capability; sets pushed true.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `pushed` | boolean | No | false | Initial pushed state. |
| `message` | string | No | Not supplied | Display text. |
| `title` | string | No | Not supplied | Display text. |
| `pushedLabel` | string | No | Not supplied | Display text. |
| `unpushedLabel` | string | No | Not supplied | Display text. |
| `pushedDescription` | string | No | Not supplied | Display text. |
| `unpushedDescription` | string | No | Not supplied | Display text. |

## pullable

Resets this object’s pushable.pushed state. Requires it to be pushed.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `label` | string | No | Not supplied | Display text. |
| `message` | string | No | Not supplied | Display text. |
| `title` | string | No | Not supplied | Display text. |

## climbable

Standing-on capability; ordinary movement requires climbing down unless the exit declares standingOn.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `climbed` | boolean | No | false | Initial climb state; engine also maintains player posture. |
| `message` | [text](#text) | No | Not supplied | Climb feedback; ordinary wording when omitted. |
| `downMessage` | string | No | Not supplied | Display text. |
| `movementBlockedMessage` | string | No | Not supplied | Display text. |
| `standingDescription` | string | No | Not supplied | Display text. |

## pressable

Enables Press; effects belong in rules, except a declared transport control.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `label` | string | No | "Press" | Menu label. |
| `message` | string | No | Not supplied | Display text. |
| `title` | string | No | Not supplied | Display text. |
| `transport` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `stop` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `dwell` | integer | No | 0 | Updates to wait before selecting another transport request. |

## edible

Eating reports outcomeText; consumed controls deletion and turn cost.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `outcomeText` | string | Yes | Not supplied | Display text. |
| `consumed` | boolean | No | false | Delete item and commit a turn when eaten. |

## tool

Held tool capable of named operations.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `capabilities` | [idList](#idlist) | Yes | Not supplied | Story-defined capability names, such as cut. |

## cuttable

Target of named tool operations.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `capability` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `tool` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `options` | array of [toolOption](#tooloption) | No | Not supplied | Named tool options. |

## toolOption

Named control for a matching tool; controller handles the action.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `label` | string | Yes | Not supplied | Display text. |

## passage

Enter interaction using the current room’s declared exit.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `destination` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `label` | string | No | "Enter" | Menu label. |

## record

Creates a note prototype in an accessible owned open notebook.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `container` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `entry` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `buttonLabel` | string | No | Not supplied | Display text. |
| `label` | string | No | Not supplied | Suffix for default Make a note label. |
| `message` | string | No | Not supplied | Display text. |
| `onExamine` | boolean | No | true | Offer recording in direct examination controls. |
| `offerInput` | boolean | No | false | Offer compatible inputs after recording. |

## choice

Named interaction control; handling belongs in choose rules.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `label` | string | Yes | Not supplied | Display text. |
| `title` | string | No | Not supplied | Display text. |
| `prompt` | string | No | Not supplied | Display text. |
| `options` | array of [choiceOption](#choiceoption) | No | Not supplied | Optional submenu controls. |

## choiceOption

Named submenu option; handling belongs in chooseOption rules.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `label` | string | Yes | Not supplied | Display text. |
| `disabled` | boolean | No | false | Initially disabled control. |

## input

Text input control; submitInput rules handle acceptance.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `label` | string | No | "Enter Input" | Menu label. |
| `title` | string | No | Not supplied | Display text. |
| `prompt` | string | No | Not supplied | Display text. |
| `placeholder` | string | No | Not supplied | Display text. |
| `notesOnly` | boolean | No | false | Hide free-form input; allow recorded values. |
| `failureMessage` | string | No | "That is not accepted." | Unhandled input response. |
| `failureTitle` | string | No | "Rejected" | Unhandled input heading. |
| `failureConsumesTurn` | boolean | No | false | Charge a turn for generic rejection. |

## npc

An actor is an ordinary object with npc configuration, not a separate top-level collection.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `state` | string | No | Not supplied | Story-defined initial state; author explicit values needed by rules. |
| `nearbyDescription` | [text](#text) | No | Not supplied | Description when in an adjacent accessible room. |
| `missions` | [missions](#missions) | No | Not supplied | Actor mission routes and base visits. Put exceptional durations and conditional reports in controller rules. |
| `movementCue` | [movementCue](#movementcue) | No | Not supplied | Actor movement report. Initial unconditional description may be authored; construct conditional variants in controller. |
| `turnCue` | [turnCue](#turncue) | No | Not supplied | Actor turn reports. Construct conditional alternatives in controller. |
| `talk` | [talkResponse](#talkresponse) | No | Not supplied | Model-owned default talk refusal and menu text. Override the action in controller rules for meaningful interaction. |
| `give` | [giveResponse](#giveresponse) | No | Not supplied | Model-owned default give refusal and menu text. Override the action in controller rules for meaningful interaction. |
| `inventory` | [items](#items) | No | Not supplied | NPC-owned object definitions. Optional; travels with its owner and is inaccessible to ordinary player actions. Nested items normalize recursively. |

## talkResponse

Model-owned default talk refusal and menu text. Override the action in controller rules for meaningful interaction.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `message` | string | No | Not supplied | Default refusal text; omitted uses the engine's neutral response. |
| `title` | string | No | "Talk" | Message heading. |
| `label` | string | No | "Talk to" | Menu verb; Give appends the recipient name. |

## giveResponse

Model-owned default give refusal and menu text. Override the action in controller rules for meaningful interaction.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `message` | string | No | Not supplied | Default refusal text; omitted uses the engine's neutral response. |
| `title` | string | No | "Give" | Message heading. |
| `label` | string | No | "Give to" | Menu verb; Give appends the recipient name. |

## missions

Actor mission routes and base visits. Put exceptional durations and conditional reports in controller rules.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `home` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `idleState` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `states` | [missionStates](#missionstates) | Yes | Not supplied | Names used by the controller to describe mission phases. |
| `routes` | dictionary of array of [routeEdge](#routeedge) | Yes | Not supplied | Room-keyed route graph. |
| `destinations` | dictionary of [missionDestination](#missiondestination) | Yes | Not supplied | Mission definitions. |
| `homeReport` | array of string | No | Not supplied | Reports on return home. |
| `blockedReport` | array of string | No | Not supplied | Reports when no route is available. |

## missionStates

Names used by the controller to describe mission phases.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `outbound` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `searching` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `returning` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |

## routeEdge

Actor route edge; room graph is independent of player restrictions.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `to` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `transport` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |

## missionDestination

Actor visit keyed by mission ID. Completion prevents ordinary repeat requests.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `room` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `searchTurns` | integer | Yes | Not supplied | Timed updates spent searching. |
| `departure` | array of string | No | Not supplied | Varied report passages; no report when omitted. |
| `departureReply` | array of string | No | Not supplied | Varied report passages; no report when omitted. |
| `arrival` | array of string | No | Not supplied | Varied report passages; no report when omitted. |
| `finished` | array of string | No | Not supplied | Varied report passages; no report when omitted. |

## transport

Independent physical transport. Occupants live in the boarding room’s ordinary collections.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `name` | string | No | Not supplied | Display text. |
| `prose` | [prose](#prose) | No | Not supplied | Entity-owned named prose; no automatic fallback between owners. |
| `space` | [transportSpace](#transportspace) | Yes | Not supplied | Only room-backed boarding is implemented. |
| `stops` | array of string or dictionary of [transportStop](#transportstop) | Yes | Not supplied | Nonempty unique room ID list, or stop IDs mapped to room definitions. |
| `stop` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `boardingOpen` | boolean | No | true | Allow boarding/leaving while idle. |
| `blockedMessage` | string | No | Not supplied | Display text. |

## transportSpace

Only room-backed boarding is implemented.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `room` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |

## transportStop

A stop outside the boarding room.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `room` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |

## beforeMove

Pre-travel acknowledgement message.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `message` | string | Yes | Not supplied | Display text. |
| `title` | string | No | "Before Moving" | Message heading. |

## imageVariant

Controller configuration: first eligible image variant wins.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `imageUrl` | string | Yes | Not supplied | Local image asset path. |
| `imagePosition` | [imagePosition](#imageposition) | No | Not supplied | Image crop alignment. |

## cue

Controller configuration: room cue or observation; text comes from model prose.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `text` | [text](#text) | Yes | Not supplied | Unconditional string, or ordered strings/named segments. Controller selects named segments; no code is evaluated. |

## exitVariant

Controller configuration: first eligible exit wording variant wins.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `before` | string | No | Not supplied | Display text. |
| `after` | string | No | Not supplied | Display text. |
| `label` | string | No | Not supplied | Display text. |

## movementCue

Actor movement report. Initial unconditional description may be authored; construct conditional variants in controller.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `description` | [text](#text) | No | Not supplied | Unconditional string, or ordered strings/named segments. Controller selects named segments; no code is evaluated. |
| `variants` | array of [actorCueVariant](#actorcuevariant) | No | Not supplied | Controller-configured alternatives. |

## turnCue

Actor turn reports. Construct conditional alternatives in controller.

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `intermittent` | boolean | No | false | Allow gaps and ambient replacements for repeated reports. |
| `variants` | array of [actorCueVariant](#actorcuevariant) | No | Not supplied | Controller-configured alternatives. |

## actorCueVariant

Controller configuration: ordered actor report alternative.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `texts` | array of [text](#text) | Yes | Not supplied | Varied reports. |
| `repeatTexts` | array of [text](#text) | No | Not supplied | Reports for repeated selection. |

## missionVariant

Controller configuration: exceptional mission duration and report override.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `searchTurns` | integer | Yes | Not supplied | Visit duration. |
| `arrival` | array of string | No | Not supplied | Arrival reports. |
| `finished` | array of string | No | Not supplied | Completion reports. |

## predicateReference

Controller configuration: named predicate for delayed work, registered in every game instance.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `predicate` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |

## transportRequest

Controller request / runtime queue entry; use requestTransport to create it.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `destination` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `actor` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `dwell` | integer | No | 0 | Delay after arrival. |
| `condition` | [predicateReference](#predicatereference) | No | Not supplied | Controller configuration: named predicate for delayed work, registered in every game instance. |
| `event` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `data` | JSON value | No | Not supplied | Serializable event payload. |

## timer

Runtime item timer; use startTimer to create it.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `remaining` | integer | Yes | Not supplied | Updates remaining. |
| `justStarted` | boolean | Yes | true | One-update grace. |
| `event` | string | No | Not supplied | Persistent entity or variant ID; references remain strings. |
| `data` | JSON value | No | Not supplied | Serializable event payload. |
| `waitUntil` | [predicateReference](#predicatereference) | No | Not supplied | Controller configuration: named predicate for delayed work, registered in every game instance. |

## runtime

Engine-maintained save metadata; do not author.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `saveFormatVersion` | `1` | No | Not supplied |  |
| `worldSchemaVersion` | `2` | No | Not supplied |  |
| `turn` | integer | No | 0 | Scheduler advances. |
| `nextScheduleId` | integer | No | 0 | Last assigned job ID. |
| `randomSeed` | integer | No | 123456789 | Saved PRNG state. |
| `scheduled` | array of [scheduledEvent](#scheduledevent) | No | Not supplied | Pending jobs. |

## scheduledEvent

Runtime scheduled job; use schedule.afterTurns to create it.

**Controller configuration or runtime state; not an authoring capability.**

| Attribute | Type | Required? | Default when omitted | Meaning |
| --- | --- | --- | --- | --- |
| `id` | integer | Yes | Not supplied | Monotonic job ID. |
| `due` | integer | Yes | Not supplied | Due scheduler turn. |
| `event` | string | Yes | Not supplied | Persistent entity or variant ID; references remain strings. |
| `data` | JSON value | No | Not supplied | Serializable payload. |

## Runtime state not authored in the model

The authoring schema does not validate complete saves. Engine save validation
remains authoritative. Initial capabilities become object.properties, and
containment becomes properties.container.items; NPC possessions remain under
properties.npc.inventory. Room scenery stays room.scenery.

| Runtime location | Fields | Meaning |
| --- | --- | --- |
| player | currentRoom, visitedRooms | Current location and visited-room facts |
| player | started, gameOver, ending, endingEncounter | Start/end state and pending ending acknowledgement |
| player | pendingAction | Saved deferred movement awaiting acknowledgement |
| player | posture | Standing position, normally {type: 'standingOn', item: ID} |
| player | achievements | Earned IDs mapped to true |
| player | turnObservations, movementCues | Current world reports |
| npc | mission, completed | Active mission and completed destination IDs |
| npc.mission | active, destination, phase, remaining, justStarted, replyPending, finished, ride | Visit progress; phases outbound/searching/returning |
| npc.mission.ride | origin, stage | Physical boarding progress |
| npc | lastTurnCue, lastTurnCueVariant, lastMissionReport, ambientCountdown | Saved report selection and timing |
| npc.movementCue | lastText | Previous movement report |
| transport | phase, queue, request, dwell | Idle/moving phase, pending/active journeys and waiting time |
| object.properties | timer | Active item timer; see timer fields above |
| runtime | turn, scheduled, nextScheduleId, randomSeed, saveFormatVersion, worldSchemaVersion | Scheduler and save metadata; see runtime fields above |

Controllers also configure room cues/observations/imageVariants, exit variants,
actor cue variants, mission destination variants and missions.sounds (room IDs
mapped to report string arrays). Assemble them from entity-owned prose in the
same mechanic module as their action rules. See the [lifecycle](engine-lifecycle.md)
and [feature reference](feature-reference.md) for ordering and selection behaviour.
