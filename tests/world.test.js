import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGame, normaliseWorld } from '../packages/engine/index.js';
import { loadWorld } from '../packages/browser/build.js';
const minimal = () => ({ title:'Small World', player:{room:'study'}, rooms:{study:{name:'Study'}} });
const withItems = items => {const world=minimal();world.rooms.study.items=items;return world;};

test('minimal world supplies collections, timing state and presentation defaults without mutating input',()=>{
    const input=minimal(), before=structuredClone(input), world=normaliseWorld(input);
    assert.deepEqual(input,before);
    assert.equal(world.version,'1');
    assert.equal(world.startScreen.title,input.title);
    assert.equal(world.player.currentRoom,'study');
    assert.equal(world.player.elapsedMinutes,0);
    assert.deepEqual(world.player.carried,{});assert.deepEqual(world.player.worn,{});
    assert.deepEqual(world.items,{});assert.deepEqual(world.achievements,{});assert.deepEqual(world.endings,[]);
    assert.deepEqual(world.rooms.study.items,{});assert.deepEqual(world.rooms.study.exits,{});
    createGame(input).validateWorld(world);
    assert.equal(normaliseWorld({...input,clock:{}}).clock.minutesPerTurn,1);
    assert.deepEqual(normaliseWorld(world),world,'normalization is idempotent');
});

test('capability defaults preserve access, fixed objects, supporters and one containment owner',()=>{
    const world=withItems({box:{name:'Box',container:true,openable:true,lockable:true,items:{letter:{name:'Letter',portable:true}}},desk:{name:'Desk',supporter:true},statue:{name:'Statue',fixed:true}});
    const game=createGame(world), box=game.findItem('box').item.properties.container;
    assert.equal(box.opened,false);assert.equal(box.locked,false);
    assert.equal(game.dispatch({type:'take',target:'letter'}).success,false);
    assert.equal(game.dispatch({type:'take',target:'statue'}).success,false);
    assert.equal(game.findItem('letter').owner.key,'box');
    assert.ok(game.dispatch({type:'open',target:'box'}).success);
    assert.ok(game.dispatch({type:'take',target:'letter'}).success);
    assert.equal(box.items.letter,undefined);
    assert.ok(game.dispatch({type:'putOn',target:'letter',secondaryTarget:'desk'}).success);
    assert.equal(game.state.player.carried.letter,undefined);
    assert.equal(game.findItem('letter').owner.key,'desk');
    assert.equal(game.dispatch({type:'close',target:'desk'}).success,false);
    const saved=JSON.parse(JSON.stringify(game.save()));
    assert.deepEqual(createGame(world).load(saved).save(),saved);
    assert.ok(world.rooms.study.items.box.items.letter,'initial world stays independent');
});

test('references, duplicate live identities and contradictory capabilities fail early with paths',()=>{
    const invalid=[
        [()=>({...minimal(),player:{room:'missing'}}),/player.room.*unknown room/],
        [()=>({...minimal(),rooms:{study:{exits:{missing:{}}}}}),/exits.missing.*unknown room/],
        [()=>withItems({box:{container:true,lockable:true,key:'missing'}}),/box.key.*unknown object/],
        [()=>withItems({box:{container:true,lockable:true,key:7}}),/box.key.*ID string/],
        [()=>withItems({statue:{fixed:true,portable:true}}),/statue.*fixed/],
        [()=>withItems({box:{container:true,locked:true}}),/box.*must be lockable/],
        [()=>withItems({desk:{supporter:true,openable:true}}),/desk.*supporter/],
        [()=>withItems({desk:{supporter:true,opened:false}}),/desk.*supporter/],
        [()=>withItems({box:{container:true,door:true}}),/box.*both/],
        [()=>withItems({box:{container:true,lockable:true,locked:true,opened:true}}),/box.*cannot start open/],
        [()=>withItems({a:{container:true,items:{coin:{}}},b:{container:true,items:{coin:{}}}}),/b.items.coin.*duplicate/],
        [()=>withItems({study:{}}),/conflicting entity ID/],
        [()=>withItems({coin:{portable:'true'}}),/coin.portable.*boolean/],
        [()=>({...minimal(),clock:{minutesPerTurn:'1'}}),/clock.minutesPerTurn.*integer/],
        [()=>withItems({box:{items:{coin:{}}}}),/items requires/],
        [()=>withItems({coin:{properties:{portable:true}}}),/directly/],
        [()=>withItems({coin:{onTake:'takeIt()'}}),/register behavior/],
        [()=>withItems({coin:{callback:()=>{}}}),/Non-JSON/],
        [()=>withItems({coin:{weight:Infinity}}),/Non-JSON/],
        [()=>withItems({coin:{weight:'3'}}),/weight.*number/],
        [()=>withItems({coin:{location:'study'}}),/declare location/],
        [()=>withItems(null),/items.*object/],
        [()=>({...minimal(),endings:null}),/endings.*array/],
        [()=>({...minimal(),id:42}),/id.*string/],
    ];
    for(const [make,pattern] of invalid) assert.throws(()=>createGame(make()),pattern);
});

test('key references can point to nested inventory or prototypes and IDs remain strings',()=>{
    const world=withItems({box:{container:true,lockable:true,key:'brass-key'}});
    world.player.carried={bag:{container:true,items:{'brass-key':{portable:true}}}};
    const game=createGame(world);
    assert.equal(game.findItem('box').item.properties.container.key,'brass-key');
    world.player.carried={};world.items={'brass-key':{portable:true}};
    assert.doesNotThrow(()=>normaliseWorld(world));
});

test('canonical worlds and saves retain explicit state during normalization',()=>{
    const canonical=normaliseWorld(withItems({box:{container:true,openable:true}}));
    canonical.rooms.study.items.box.properties.container.opened=true;
    canonical.rooms.study.items.box.properties.unusualFlag=false;
    canonical.player.elapsedMinutes=27;
    assert.deepEqual(normaliseWorld(canonical),canonical);
    assert.deepEqual(createGame(canonical).world,canonical);
});

test('JSON5 loader accepts comments, trailing commas and unquoted keys; errors identify the source',async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'if-world-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const file=path.join(directory,'world.json5');
    await fs.writeFile(file,`{ // An ordinary declarative world\n title: 'Small World', player: {room: 'study'}, rooms: {study: {}}, }`);
    assert.equal((await loadWorld(file)).player.currentRoom,'study');
    for(const source of ["{ title: doSomething() }", "{ title: 'Broken',", "{title:'Bad', player:{room:'missing'},rooms:{}}", "{title:'Bad', player:{room:'study'},rooms:{study:{}},weight:NaN}"]) {
        await fs.writeFile(file,source);await assert.rejects(loadWorld(file),/Cannot load world.*world.json5/);
    }
});

test('Quiet Study authoring compiles into the complete ordinary puzzle',async()=>{
    const world=await loadWorld(new URL('../examples/study.json5',import.meta.url));
    const game=createGame(world);game.validateWorld(game.state);
    for(const action of [{type:'start'},{type:'take',target:'brass-key'},{type:'unlock',target:'wooden-box',secondaryTarget:'brass-key'},{type:'open',target:'wooden-box'},{type:'take',target:'letter'},{type:'go',target:'hall'}]) assert.ok(game.dispatch(action).success);
    assert.equal(game.state.player.currentRoom,'hall');
    assert.equal(game.state.player.carried.letter.description,'Meet me at dusk.');
    assert.equal(game.state.player.elapsedMinutes,5);
});
