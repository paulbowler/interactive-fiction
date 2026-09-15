import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const schema = JSON.parse(fs.readFileSync(new URL('../packages/engine/world.schema.json', import.meta.url)));
const names = [
  'world','items','idList','player','room','exit','scenery','object','description','text','paragraphs','prose',
  'imagePosition','startScreen','achievement','ending','encounter','clock','clockNotice','clockDeadline',
  'wearable','insertion','connectable','connection','readable','searchable','pushable',
  'pullable','climbable','pressable','edible','tool','cuttable','toolOption','passage',
  'record','choice','choiceOption','input','npc','talkResponse','giveResponse','missions','missionStates','routeEdge',
  'missionDestination','transport','transportSpace','transportStop','beforeMove',
  'imageVariant','cue','exitVariant','movementCue','turnCue','actorCueVariant','missionVariant',
  'predicateReference','transportRequest','timer','runtime','scheduledEvent',
];
function type(s) {
  if (s === false) return 'Not supported';
  if (s.$ref) { const id=s.$ref.split('/').at(-1); return `[${id}](#${id.toLowerCase()})`; }
  if (s.const !== undefined) return '`'+JSON.stringify(s.const)+'`';
  if (s.oneOf) return s.oneOf.map(type).join(' or ');
  if (s.type === 'array') return `array of ${type(s.items)}`;
  if (s.type === 'object' && s.additionalProperties && typeof s.additionalProperties === 'object')
    return `dictionary of ${type(s.additionalProperties)}`;
  return s.type || 'JSON value';
}
const escape = text => String(text).replaceAll('|','&#124;').replaceAll('\n',' ');
export function renderReference() {
  let out = `# Model attributes

This is the field-by-field companion to the [feature reference](feature-reference.md).
It is generated from [world.schema.json](../packages/engine/world.schema.json).
Edit schema field descriptions, then run `+`\`node scripts/document-world-schema.js\``+`.

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

` + names.map(name=>`- [${name}](#${name.toLowerCase()})`).join('\n') + `

## Capability combinations

- \`container: true\` enables holding objects. It does not imply opening or visibility.
- An always-open basket needs \`container: true, opened: true\`. An openable box
  needs \`container: true, openable: true\` and starts closed unless opened is true.
- \`supporter: true\` supplies holding and opened true. Do not add openable,
  lockable, locked, door, or opened false.
- Opening/locking fields require a container, supporter or door. Holding fields
  (items, accepts, insertable, transparent, takeLabel) require a container/supporter.
- \`locked: true\` and key require \`lockable: true\`. A locked object cannot start
  opened. Lockable does not itself imply openable.
- Fixed and explicitly portable cannot both be true. Container and door cannot
  both be true. An opened door requires openable.
- Contents have one owner: nested items, room items or player inventory. Do not
  add a second location attribute.
- transparent exposes closed contents for both viewing and taking. Ordinary
  placement still needs opened. There is no built-in weight or capacity limit.

## Container example

\`\`\`json5
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
\`\`\`

Declare brassKey elsewhere as an object. Unlock does not also open the chest.
Use a controller report rule to customize container lock/unlock feedback;
lockMessage and unlockMessage customize doors only.

`;
  for (const name of names) {
    const def=schema.$defs[name];
    out+=`## ${name}\n\n${def.description || ''}\n\n`;
    if (def.$comment) out+=`**${def.$comment}**\n\n`;
    if (!def.properties) { out+=`Type: ${type(def)}.\n\n`;continue; }
    out+='| Attribute | Type | Required? | Default when omitted | Meaning |\n| --- | --- | --- | --- | --- |\n';
    for (const [key, prop] of Object.entries(def.properties)) {
      const desc=prop.description || (prop.$ref && schema.$defs[prop.$ref.split('/').at(-1)]?.description) || '';
      out+=`| \`${key}\` | ${type(prop)} | ${prop===false?'Forbidden':def.required?.includes(key)?'Yes':'No'} | ${prop.default===undefined?'Not supplied':escape(JSON.stringify(prop.default))} | ${escape(desc)} |\n`;
    }
    out+='\n';
  }
  out+=`## Runtime state not authored in the model

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
`;
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = new URL('../docs/model-attributes.md', import.meta.url);
  const result = renderReference();
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(file,'utf8') !== result) throw new Error('Regenerate docs/model-attributes.md');
  } else fs.writeFileSync(file,result);
}
