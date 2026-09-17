import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, normaliseWorld } from '../packages/engine/index.js';
const world = () => ({
    title:'The Workshop', player:{room:'workshop'},
    rooms:{workshop:{name:'Workshop',description:{default:'A quiet workshop.',night:'The workshop is dark.'},
        scenery:{mural:{title:'Mural',description:{default:'A faded mural.',revealed:'A ship beneath the paint.'}}},
        items:{box:{name:'Box',container:true,openable:true,description:{default:'The box is closed.',opened:'The box is open.'},
            items:{note:{name:'Note',portable:true,description:{default:'A folded note.',held:'A note in your hand.'}}}},
            key:{name:'Key',portable:true,description:'A brass key.'}}}}
});
function create() {
    const game=createGame(world());
    game.describe('box',ctx=>ctx.target.properties.container.opened ? 'opened' : 'default');
    game.describe('workshop',ctx=>ctx.state.player.night ? 'night' : undefined);
    game.describe('workshop:mural',ctx=>ctx.target.examined ? 'revealed' : 'default');
    game.describe('note',ctx=>ctx.game.isDirectlyCarriedLocation(ctx.game.findItem(ctx.action.target)) ? 'held' : undefined);
    return game;
}
test('strings and variant defaults work without a resolver and normalization preserves catalogs',()=>{
    const input=world(), game=createGame(input);
    assert.equal(game.getDescription('key'),'A brass key.');
    assert.equal(game.getDescription('box'),'The box is closed.');
    assert.equal(game.getDescription('workshop:mural'),'A faded mural.');
    assert.deepEqual(normaliseWorld(input).rooms.workshop.description,input.rooms.workshop.description);
    game.describe('key',()=>{throw new Error('Strings should not call a resolver');});
    assert.equal(game.getDescription('key'),'A brass key.');
});
test('room, item and scenery rendering resolve current facts without caching or advancing time',()=>{
    const game=create(), initial=game.save();
    assert.equal(game.getRoomDescriptionText('workshop'),'A quiet workshop.');
    assert.equal(game.getItemDescription('box',game.findItem('box').item),'The box is closed.');
    assert.deepEqual(game.save(),initial,'description queries do not alter the save');
    game.state.player.night=true;
    assert.equal(game.dispatch({type:'look'}).value,'The workshop is dark.');
    assert.ok(game.dispatch({type:'open',target:'box'}).success);
    assert.equal(game.dispatch({type:'examine',target:'box'}).value.description,'The box is open.');
    const scenery=game.dispatch({type:'examineScenery',target:'workshop:mural'});
    assert.equal(scenery.messages[0].args[0],'A ship beneath the paint.');
    assert.equal(game.state.player.elapsedMinutes,1,'examination remains free');
    assert.equal(game.getDescription('note'),'A folded note.');
    game.dispatch({type:'take',target:'note'});
    assert.equal(game.getDescription('note'),'A note in your hand.');
});
test('resolvers are configuration; save/load restores facts and reacquires current targets',()=>{
    const game=create();game.dispatch({type:'open',target:'box'});game.dispatch({type:'take',target:'note'});
    const saved=JSON.parse(JSON.stringify(game.save())), restored=create().load(saved);
    assert.equal(restored.getDescription('note'),'A note in your hand.');
    assert.equal(restored.getDescription('box'),'The box is open.');
    assert.deepEqual(restored.save(),saved);
    assert.equal(restored.world.rooms.workshop.items.box.properties.container.opened,false);
    // A controller can still deliberately replace current prose with a string.
    restored.findItem('box').item.description='The box has disappeared into smoke.';
    assert.equal(restored.getDescription('box'),'The box has disappeared into smoke.');
});
test('resolver context supplies current entity, initial definition, ID, room and state',()=>{
    const game=createGame(world());
    const remove=game.describe('note',ctx=>{
        assert.equal(ctx.action.target,'note');assert.equal(ctx.action.type,'describe');
        assert.equal(ctx.target,game.findItem('note').item);assert.equal(ctx.room,game.state.rooms.workshop);
        assert.equal(ctx.definition,game.world.rooms.workshop.items.box.properties.container.items.note);
        assert.equal(ctx.state,game.state);return 'held';
    });
    assert.equal(game.getDescription('note'),'A note in your hand.');remove();
    assert.equal(game.getDescription('note'),'A folded note.');
});
test('invalid definitions fail in authoring, canonical input and atomic save loading',()=>{
    for(const description of [null,42,{opened:'Missing default'},{default:false},{default:'Fine',other:[]},{default:'Fine','':'Empty key'},[null]]) {
        const model=world();model.rooms.workshop.items.box.description=description;
        assert.throws(()=>createGame(model),/Invalid description.*box/);
        const game=create(), before=game.save(), saved=game.save();
        saved.rooms.workshop.items.box.description=description;
        assert.throws(()=>game.load(saved),/Invalid description.*box/);
        assert.deepEqual(game.save(),before);
        assert.throws(()=>createGame(saved),/Invalid description.*box/);
    }
    const badScenery=world();badScenery.rooms.workshop.scenery.mural.description={a:'No default'};
    assert.throws(()=>normaliseWorld(badScenery),/scenery.mural.description/);
});
test('bad resolver results, asynchronous handlers, duplicates and cycles fail clearly',()=>{
    const game=createGame(world());
    assert.throws(()=>game.describe('box',async()=> 'default'),/synchronous/);
    assert.throws(()=>game.describe('',()=> 'default'),/ID/);
    for(const selected of ['missing',null,false,0,[false],['missing'],Promise.resolve('default')]) {
        const remove=game.describe('box',()=>selected);
        assert.throws(()=>game.getDescription('box'),/Invalid description selection for box/);remove();
    }
    const remove=game.describe('box',()=>game.getDescription('box'));
    assert.throws(()=>game.getDescription('box'),/Recursive description resolver/);
    assert.throws(()=>game.describe('box',()=> 'default'),/Duplicate/);remove();
    assert.equal(game.getDescription('box'),'The box is closed.');
    assert.throws(()=>game.getDescription('missing'),/Unknown description target/);
});
test('executable description segments are rejected in worlds and saved state',()=>{
    const model=world();
    model.rooms.workshop.items.box.description=['A box. ',
        {condition:{type:'itemState',item:'box',state:'container.opened'},text:'It is open.'}];
    assert.throws(()=>createGame(model),/Invalid description/);
    const game=createGame(world()), saved=game.save();
    saved.rooms.workshop.items.box.description=model.rooms.workshop.items.box.description;
    assert.throws(()=>game.load(saved),/Invalid description/);
    assert.equal(game.getDescription('box'),'The box is closed.');
});

test('named description arrays select one variant with stable IDs and a required default',()=>{
    const model=world();
    const convert=entity=>{entity.description=Object.entries(entity.description).map(([id,text])=>({id,text}));};
    convert(model.rooms.workshop);convert(model.rooms.workshop.scenery.mural);convert(model.rooms.workshop.items.box);
    const game=createGame(model);
    game.describe('box',ctx=>ctx.target.properties.container.opened ? 'opened' : undefined);
    assert.equal(game.getDescription('box'),'The box is closed.');
    game.dispatch({type:'open',target:'box'});
    assert.equal(game.getDescription('box'),'The box is open.');
    assert.equal(game.getDescription('workshop'),'A quiet workshop.');
    assert.equal(game.getDescription('workshop:mural'),'A faded mural.');
    const restored=createGame(model).load(game.save());
    restored.describe('box',()=> 'opened');
    assert.equal(restored.getDescription('box'),'The box is open.');
    for(const description of [
        [{id:'other',text:'No default'}],
        [{id:'default',text:'One'},{id:'default',text:'Two'}],
        [{id:'default',text:'One'},'Mixed'],
        [{id:'default',text:'One',condition:{type:'currentRoom',room:'workshop'}}],
        [{id:'default',text:false}],
    ]) {
        const invalid=world();invalid.rooms.workshop.description=description;
        assert.throws(()=>createGame(invalid),/Invalid description.*workshop/);
        const before=game.save(), saved=game.save();saved.rooms.workshop.description=description;
        assert.throws(()=>game.load(saved),/Invalid description.*workshop/);
        assert.deepEqual(game.save(),before);
    }
});

test('ordered named selections compose prose without positional authoring or state changes',()=>{
    const input=world();
    input.rooms.workshop.description=[
        {id:'default',text:'A quiet workshop. '},
        {id:'night',text:'The lamps are dark.'},
        {id:'rain',text:' Rain taps at the windows.'},
    ];
    const game=createGame(input), before=game.save();
    const remove=game.describe('workshop',()=>['default','rain']);
    assert.equal(game.getDescription('workshop'),'A quiet workshop.  Rain taps at the windows.');
    game.state.rooms.workshop.description.reverse();
    assert.equal(game.getDescription('workshop'),'A quiet workshop.  Rain taps at the windows.','array order is irrelevant');
    game.load(before);assert.equal(game.getDescription('workshop'),'A quiet workshop.  Rain taps at the windows.');
    assert.deepEqual(game.save(),before);remove();
    let off=game.describe('workshop',()=>[]);assert.equal(game.getDescription('workshop'),'');off();
    off=game.describe('workshop',()=>['default','default']);assert.throws(()=>game.getDescription('workshop'),/Duplicate description selection/);off();
    game.state.rooms.workshop.items.box.description={default:'A box.',opened:'It is open.'};
    game.describe('box',()=>['default','opened']);
    assert.equal(game.getDescription('box'),'A box. It is open.','item prose retains sentence spacing');
});

test('custom article phrases survive normalization and render outside item links', () => {
    const game = createGame({title: 'Hearth', player: {room: 'study'}, rooms: {study: {items: {
        firesideSet: {name: 'Fireside Tools', article: 'a set of', fixed: true, supporter: true,
            items: {tongs: {name: 'tongs', article: 'a pair of', portable: true}}},
    }}}});
    const item = game.findItem('firesideSet').item;
    assert.equal(game.getItemDisplayName('firesideSet', item, {article: 'indefinite'}), 'a set of fireside tools');
    assert.equal(game.getItemReferenceText('firesideSet', item), 'a set of [[fireside tools|item:firesideSet]]');
    assert.equal(game.getContainerContentsInlineText(item), 'a pair of tongs');
    assert.equal(game.getContainerContentsInlineText(item, true), 'a pair of [[tongs|item:tongs]]');
    assert.equal(game.getItemDisplayName('firesideSet', item), 'Fireside Tools');
    assert.equal(game.getProseItemName(item), 'the fireside tools');
    for (const [article, expected] of [[undefined, 'a'], ['a', 'a'], ['an', 'an'], ['the', 'the'], ['some', 'some'], [' a set of ', 'a set of'], ['', 'a'], ['none', '']]) {
        const entry = {name: 'tools', article};
        const prefix = expected ? `${expected} ` : '';
        assert.equal(game.getItemReferenceText('tools', entry), `${prefix}[[tools|item:tools]]`);
    }
    game.load(JSON.parse(JSON.stringify(game.save())));
    assert.equal(game.getItemReferenceText('firesideSet', game.findItem('firesideSet').item), 'a set of [[fireside tools|item:firesideSet]]');
});
