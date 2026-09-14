import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../packages/engine/index.js';
import { CONTINUE, STOP, HANDLED } from '../packages/engine/index.js';
const world=JSON.parse(fs.readFileSync(new URL('../examples/study.json',import.meta.url)));
const fresh=()=>createGame(world);

test('unrelated world supports ordinary actions without story scripts',()=>{
    const game=fresh();
    game.validateWorld(game.state);
    game.dispatch({type:'start'});
    assert.equal(game.dispatch({type:'take',target:'letter'}).success,false);
    assert.equal(game.dispatch({type:'take',target:'statue'}).success,false);
    assert.equal(game.dispatch({type:'open',target:'wooden-box'}).success,false);
    for(const action of [
        {type:'take',target:'brass-key'}, {type:'unlock',target:'wooden-box',secondaryTarget:'brass-key'},
        {type:'open',target:'wooden-box'},{type:'take',target:'letter'},
        {type:'putOn',target:'letter',secondaryTarget:'desk'}, {type:'removeFrom',target:'letter'},
        {type:'putIn',target:'letter',secondaryTarget:'wooden-box'},
        {type:'close',target:'wooden-box'},{type:'lock',target:'wooden-box'},
        {type:'go',target:'hall'},{type:'drop',target:'brass-key'}
    ]) assert.equal(game.dispatch(action).success,true,JSON.stringify(action));
    assert.equal(game.findItem('letter').owner.key,'wooden-box');
    assert.equal(game.findItem('brass-key').owner.key,'hall');
    assert.equal(world.player.currentRoom,'study');
    assert.equal(fresh().findItem('brass-key').owner.key,'study');
});

test('before/instead/standard/after/report have explicit ordered outcomes',()=>{
    const game=fresh(), trace=[];
    game.before('take','brass-key',()=>{trace.push('before');return CONTINUE;});
    game.instead('take',{when:ctx=>ctx.target.properties.portable},()=>{trace.push('instead');return CONTINUE;});
    game.after('take','brass-key',ctx=>{assert.equal(ctx.state.player.carried['brass-key'].name,'Brass Key');trace.push('after');ctx.emit('keyTaken');});
    game.events.on('keyTaken',()=>trace.push('event'));
    game.report('take',()=>{trace.push('report');});
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).success,true);
    assert.deepEqual(trace,['before','instead','after','event','report']);
    trace.length=0;
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).success,false);
    assert.deepEqual(trace,['before','instead','report']);
});

test('blocked and replaced actions never run the standard action or after rules',()=>{
    const game=fresh();let after=0;
    game.after('take',()=>{after++;});
    const remove=game.before('take','brass-key',ctx=>{ctx.say('Wait.');return STOP;});
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).status,STOP);
    assert.equal(game.findItem('brass-key').owner.key,'study');
    remove();
    game.instead('take','brass-key',ctx=>{ctx.say('It turns to dust.');ctx.game.deleteItem('brass-key');ctx.commit();return HANDLED;});
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).status,HANDLED);
    assert.equal(game.findItem('brass-key'),null);
    assert.equal(after,0);
    game.before('open',()=>true);
    assert.throws(()=>game.dispatch({type:'open',target:'wooden-box'}),/Invalid before rule result/);
});

test('events use FIFO delivery and stop cycles without recursive stack growth',()=>{
    const game=fresh(),seen=[];
    game.events.on('a',()=>{seen.push('a1');game.events.emit('b');});
    game.events.on('a',()=>seen.push('a2'));
    game.events.on('b',()=>seen.push('b'));
    game.events.emit('a');assert.deepEqual(seen,['a1','a2','b']);
    const off=game.events.on('cycle',()=>game.events.emit('cycle'));
    assert.throws(()=>game.events.emit('cycle'),/Event cycle/);off();
    game.events.emit('b');assert.equal(seen.at(-1),'b');
});

test('scheduled events count successful turns and survive serialization',()=>{
    const game=fresh();game.dispatch({type:'start'});
    const events=[];game.events.on('notice',data=>events.push(data));
    game.schedule.afterTurns(2,'notice',{text:'Dusk'});
    game.dispatch({type:'take',target:'statue'});
    game.dispatch({type:'look'});
    game.dispatch({type:'wait'});assert.deepEqual(events,[]);
    const restored=fresh().load(game.save());restored.events.on('notice',data=>events.push(data));
    restored.dispatch({type:'wait'});assert.deepEqual(events,[{text:'Dusk'}]);
    restored.dispatch({type:'wait'});assert.equal(events.length,1);
});

test('deferred movement saves its continuation and runs go consequences on acknowledgement',()=>{
    const model=structuredClone(world);
    model.rooms.study.exits.hall.beforeMove={message:'You pause at the threshold.'};
    const game=createGame(model);game.dispatch({type:'start'});
    game.dispatch({type:'go',target:'hall'});
    assert.equal(game.state.player.currentRoom,'study');
    const restored=createGame(model).load(JSON.parse(JSON.stringify(game.save())));
    let entered=0;restored.after('go','hall',()=>{entered++;});
    assert.equal(restored.dispatch({type:'wait'}).status,STOP);
    restored.dispatch({type:'acknowledgeMessage'});
    assert.equal(restored.state.player.currentRoom,'hall');
    assert.equal(entered,1);
    assert.equal(restored.state.player.elapsedMinutes,1);
    assert.equal(restored.state.player.pendingAction,undefined);
});

test('actions can be registered without changing the engine',()=>{
    const game=fresh();
    game.registerAction('sing',ctx=>{ctx.state.player.sang=true;ctx.say('La!');ctx.commit();});
    assert.equal(game.dispatch({type:'sing'}).success,true);
    assert.equal(game.state.player.sang,true);
});
