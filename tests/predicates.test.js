import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../packages/engine/index.js';

const world = () => ({title: 'River Crossing', player: {room: 'bank'}, rooms: {
    bank: {name: 'Bank', items: {bell: {name: 'Bell'}}},
    island: {name: 'Island'}, deck: {name: 'Deck'},
}, transports: {ferry: {space: {room: 'deck'}, stop: 'bank', stops: ['bank', 'island']}}});
function fresh() {
    const game = createGame(world());
    game.registerPredicate('ready', ctx => ctx.state.player.ready === true);
    return game;
}

test('saved delayed predicates are checked against current facts', () => {
    let game = fresh();
    assert.equal(game.requestTransport({transport: 'ferry', destination: 'island', condition: {predicate: 'ready'}}), false);
    game.state.player.ready = true;
    assert.equal(game.requestTransport({transport: 'ferry', destination: 'island', condition: {predicate: 'ready'}, event: 'continued'}), true);
    game.advanceTransports();
    game.startTimer({item: 'bell', turns: 1, justStarted: false, waitUntil: {predicate: 'ready'}, event: 'ring'});
    game.state.player.ready = false;
    const saved = JSON.parse(JSON.stringify(game.save()));
    game = fresh().load(saved);
    const seen = [];
    game.events.on('continued', () => seen.push('continued'));
    game.events.on('ring', () => seen.push('ring'));
    game.advanceTransports();
    assert.equal(game.getTransport('ferry').stop, 'island', 'physical travel still completes');
    game.advanceTimers();
    assert.deepEqual(seen, [], 'invalid continuation is skipped and timer waits');
    assert.equal(game.findItem('bell').item.properties.timer.remaining, 0);
    game.state.player.ready = true;
    game.advanceTimers();
    assert.deepEqual(seen, ['ring']);
    assert.equal(game.findItem('bell').item.properties.timer, undefined);
});

test('predicates require explicit synchronous boolean results', () => {
    const game = fresh();
    assert.throws(() => game.registerPredicate('ready', () => true), /Duplicate predicate/);
    assert.throws(() => game.registerPredicate('async', async () => true), /synchronous/);
    game.registerPredicate('ambiguous', () => 1);
    assert.throws(() => game.testPredicate({predicate: 'ambiguous'}), /must return a boolean/);
    assert.throws(() => game.testPredicate({predicate: 'unknown'}), /Unknown predicate/);
    assert.throws(() => game.testPredicate({type: 'currentRoom', room: 'bank'}), /named predicate/);
});

test('executable model records and removed interpreter APIs are rejected', () => {
    const game = fresh();
    for (const name of ['registerScript', 'evaluateCondition', 'performAction', 'performEffect', 'selectConditionalAction', 'runClueOnExamine'])
        assert.equal(game[name], undefined, name);
    for (const alter of [
        state => {state.rooms.bank.items.bell.properties.choices = [{id: 'ring', action: {message: 'Ring'}}];},
        state => {state.rooms.bank.items.bell.properties.onExamine = {effects: []};},
        state => {state.rooms.bank.exits.island = {condition: {predicate: 'ready'}};},
        state => {state.stateRules = [];},
        state => {state.rooms.bank.items.bell.properties.conditions = [{type: 'currentRoom', room: 'bank'}];},
        state => {state.rooms.bank.items.bell.properties.script = 'obsolete';},
    ]) {
        const saved = game.save(); alter(saved);
        assert.throws(() => game.load(saved), /rules|records|listeners/);
        assert.deepEqual(game.save(), fresh().save(), 'failed loads are atomic');
    }
    assert.throws(() => game.startTimer({item: 'bell', turns: 1, effects: []}), /require an event/);
    assert.equal(game.requestTransport({transport: 'ferry', destination: 'island', effects: []}), false);
});
