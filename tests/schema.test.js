import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSON5 from 'json5';
import {validateWorldData, loadWorld} from '../packages/browser/build.js';
import {createGame, normaliseWorld} from '../packages/engine/index.js';
import {renderReference} from '../scripts/document-world-schema.js';

const source=JSON5.parse(fs.readFileSync(new URL('./fixtures/authoring.json5',import.meta.url),'utf8'));
test('all authoring families validate before normalization without inserting defaults or altering prose', async()=>{
  const initial=structuredClone(source);
  assert.equal(validateWorldData(source),source);
  assert.deepEqual(source,initial);
  const model=await loadWorld(new URL('./fixtures/authoring.json5',import.meta.url));
  const game=createGame(model);
  assert.equal(game.getEntity('chest').properties.container.opened,false);
  assert.equal(game.getEntity('shelf').properties.container.opened,true);
  assert.equal(game.getEntity('parcel').properties.sealed,true);
  assert.deepEqual(game.getTransport('ferry').stops,{hall:{room:'hall'},garden:{room:'garden'}});
  assert.deepEqual(game.load(game.save()).save(),game.save());
});
test('schema catches invalid nested capability, screen, scenery, route and progress shapes',()=>{
  const cases=[
    [w=>delete w.player.room,/player/],
    [w=>w.rooms.hall.items.chest.locked='true',/locked/],
    [w=>w.rooms.hall.items.chest.items.parcel.portable=1,/portable/],
    [w=>w.rooms.hall.items.chest.accepts='parcel',/accepts/],
    [w=>w.rooms.hall.items.chest.items.parcel.fixed=true,/portable/],
    [w=>w.rooms.hall.items.shelf.opened=false,/opened/],
    [w=>w.rooms.hall.items.key.locked=true,/lockable/],
    [w=>w.rooms.hall.items.chest.door=true,/door/],
    [w=>w.rooms.hall.items.book.readable={},/text/],
    [w=>w.rooms.hall.items.reader.insertable.key.retain='yes',/retain/],
    [w=>w.rooms.hall.items.console.choices[0].options[0].disabled='true',/disabled/],
    [w=>w.rooms.hall.items.courier.npc.missions.states={},/outbound/],
    [w=>w.rooms.hall.items.courier.npc.missions.destinations.delivery.searchTurns=0,/searchTurns/],
    [w=>w.transports.ferry.space={object:'satchel'},/space/],
    [w=>w.transports.ferry.stops=['hall','hall'],/stops/],
    [w=>w.achievements.delivered.description=4,/description/],
    [w=>delete w.endings[0].id,/id/],
    [w=>w.startScreen.imagePosition={x:42},/imagePosition/],
    [w=>w.clock.notices[0].minute=0,/minute/],
    [w=>w.rooms.hall.scenery.mural.description={lit:'Missing default'},/description/],
    [w=>w.rooms.hall.items.plaque.recordable.entry=4,/entry/],
    [w=>w.rooms.hall.items.chest.items.parcel.script='run()',/property name/],
  ];
  for(const [change,error] of cases) {
    const world=structuredClone(source);change(world);
    assert.throws(()=>validateWorldData(world),error);
  }
});
test('schema permits bespoke state but engine still validates graph references and duplicate identities',()=>{
  const valid=structuredClone(source);
  valid.rooms.hall.items.chest.items.parcel.deliveryStage=2;
  valid.rooms.hall.items.courier.npc.missions.destinations.delivery.internal=true;
  validateWorldData(valid);
  for(const change of [
    w=>w.player.room='missing',
    w=>w.rooms.hall.items.chest.key='missing',
    w=>w.rooms.garden.items={parcel:{portable:true}},
  ]) {
    const world=structuredClone(valid);change(world);
    validateWorldData(world);
    assert.throws(()=>normaliseWorld(world),/unknown|duplicate/);
  }
});
test('attribute reference is generated from the shipped schema',()=>{
  assert.equal(fs.readFileSync(new URL('../docs/model-attributes.md',import.meta.url),'utf8'),renderReference());
});


test('clock startTime validates in authoring, direct engine input and saves', () => {
  for (const startTime of ['00:00', '09:30', '23:59']) {
    const world = structuredClone(source);
    world.clock.startTime = startTime;
    validateWorldData(world);
    assert.equal(createGame(world).formatClockTime(0), startTime);
  }
  for (const startTime of ['24:00', '12:60', '9:30', '09:3', '09:30:00', '09:30\n', '', null, 930]) {
    const world = structuredClone(source);
    world.clock.startTime = startTime;
    assert.throws(() => validateWorldData(world), /startTime/);
    assert.throws(() => createGame(world), /clock.startTime/);
    const game = createGame(source);
    const saved = game.save();
    saved.clock.startTime = startTime;
    assert.throws(() => game.load(saved), /clock.startTime/);
    assert.throws(() => createGame(saved), /clock.startTime/);
  }
});

test('unlock labels customize key and manual menus without changing action semantics', () => {
  for (const kind of ['door', 'container']) {
    for (const keyed of [false, true]) {
      const model = {title: 'Chain', player: {room: 'hall', carried: {
        cutters: {name: 'bolt cutters', portable: true},
      }}, rooms: {hall: {items: {
        barrier: {name: 'chain-locked door', [kind]: true, openable: true, lockable: true,
          locked: true, ...(keyed ? {key: 'cutters'} : {}), unlockLabel: 'Cut chain'},
      }}}};
      validateWorldData(model);
      const game = createGame(model);
      const owner = keyed ? 'cutters' : 'barrier';
      const actionID = keyed ? 'unlock:barrier' : 'unlock';
      const label = () => game.getAvailableActions(owner).find(action => action.id === actionID)?.label;
      assert.equal(label(), 'Cut chain');
      game.load(JSON.parse(JSON.stringify(game.save())));
      assert.equal(label(), 'Cut chain');
      let after = 0;
      game.after('unlock', 'barrier', () => { after++; });
      assert.equal(game.dispatch({type: actionID, target: owner}).success, true);
      assert.equal(after, 1);
      assert.equal(game.findItem('barrier').item.properties[kind].locked, false);
      assert.equal(game.state.player.elapsedMinutes, 1);
      assert.equal(label(), undefined);
      delete model.rooms.hall.items.barrier.unlockLabel;
      const ordinary = createGame(model);
      assert.equal(ordinary.getAvailableActions(owner).find(action => action.id === actionID).label,
        keyed ? 'Unlock chain-locked door' : 'Unlock');
      model.rooms.hall.items.barrier.unlockLabel = 42;
      assert.throws(() => validateWorldData(model), /unlockLabel/);
    }
  }
});
