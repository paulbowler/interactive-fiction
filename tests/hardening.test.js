import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../packages/browser/build.js';
import { createGame } from '../packages/engine/index.js';
const world=await loadWorld(new URL('../examples/study.json5',import.meta.url));
const fresh=()=>createGame(world);

test('saves reject lossy values, cycles, accessors and unsafe keys',()=>{
    for(const invalid of [()=>{},NaN,Infinity,1n,new Date(),new Map(),{get x(){return 1;}},JSON.parse('{"__proto__":{"polluted":true}}')]) {
        const game=fresh();game.state.player.invalid=invalid;
        assert.throws(()=>game.save(),/JSON|accessor|Unsafe/);
    }
    const game=fresh();game.state.player.cycle=game.state;
    assert.throws(()=>game.save(),/Circular/);
    assert.equal({}.polluted,undefined);
});

test('invalid or foreign saves leave the running game untouched',()=>{
    const game=fresh(),before=game.save();
    for(const change of [
        s=>{s.rooms.study.description=[{condition:{predicate:'unknown'},text:'x'}];},s=>{s.id='another-story';},s=>{s.runtime.saveFormatVersion=2;},s=>{s.runtime.turn=-1;},
        s=>{s.runtime.worldSchemaVersion=1;},s=>{s.rooms.study.clues={};},s=>{s.runtime.randomSeed=2**32;},s=>{s.runtime.scheduled=[{id:1,due:2,event:'x'}];},
        s=>{s.player.pendingAction={type:'completeMove',exitKey:'missing',exitDefinition:{}};}
    ]) {const save=structuredClone(before);change(save);assert.throws(()=>game.load(save));assert.deepEqual(game.save(),before);}
    assert.throws(()=>createGame({...world,schemaVersion:3}),/Unsupported/);
});

test('initial random seed and current saves survive compatible engine updates',()=>{
    const game=createGame(world,{seed:42}),saved=game.save();
    assert.equal(saved.runtime.randomSeed,42);
    assert.equal(saved.runtime.saveFormatVersion,1);
    assert.equal(saved.runtime.worldSchemaVersion,2);
    assert.deepEqual(fresh().load(saved).save(),saved);
    const unversioned=structuredClone(world);delete unversioned.runtime;
    assert.equal(fresh().load(unversioned).save().runtime.saveFormatVersion,1);
});

test('registration and malformed requests fail clearly without losing dispatcher availability',()=>{
    const game=fresh();
    assert.throws(()=>game.before('take',async()=>{}),/synchronous/);
    assert.throws(()=>game.events.on('event',async()=>{}),/synchronous/);
    assert.throws(()=>game.registerAction('sing',async()=>{}),/synchronous/);
    for(const action of [{type:''},{type:'take',target:{}},{type:'choose',index:-1}]) assert.throws(()=>game.dispatch(action));
    const unregister=game.registerAction('sing',ctx=>{ctx.commit();});
    assert.ok(game.dispatch({type:'sing'}).success);unregister();
    assert.equal(game.dispatch({type:'sing'}).status,'STOP');
    const off=game.before('take',()=>{throw new Error('test');});
    assert.throws(()=>game.dispatch({type:'take',target:'brass-key'}),/test/);off();
    assert.ok(game.dispatch({type:'take',target:'brass-key'}).success);
});

test('scheduler rejects unserializable payloads without adding a job',()=>{
    const game=fresh(),before=game.save();
    assert.throws(()=>game.schedule.afterTurns(2,'notice',()=>{}),/JSON/);
    assert.deepEqual(game.save(),before);
});
