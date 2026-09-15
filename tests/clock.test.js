import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../packages/engine/index.js';
import {validateWorldData} from '../packages/browser/build.js';

const world = (startTime = '23:58', time = '00:03', minutesPerTurn = 1) => ({
    title: 'Night watch', clock: {startTime, minutesPerTurn, deadline: {time, ending: 'too-late'}},
    player: {room: 'hall'}, rooms: {hall: {name: 'Hall'}},
    endings: [{id: 'too-late', title: 'Too late', text: ['Dawn has arrived.']}, {id: 'won'}],
});

test('deadline ends play at the exact minute, before story checks and scheduled events', () => {
    const game = createGame(world());
    const ended = [];
    const saves = [];
    let scheduled = false;
    game.events.on('gameEnded', event => ended.push(event.ending));
    game.events.on('alarm', () => { scheduled = true; });
    game.events.on('stateCheck', () => {
        if (game.state.player.elapsedMinutes >= 5) game.endGame(game.state.endings[1]);
    });
    game.setHooks({saveGameModel: () => saves.push(game.save())});
    game.dispatch({type: 'start'});
    game.schedule.afterTurns(5, 'alarm');
    game.dispatch({type: 'wait'});
    game.dispatch({type: 'wait'});
    game.dispatch({type: 'wait'});
    game.dispatch({type: 'wait'});
    assert.ok(!game.state.player.gameOver);
    game.dispatch({type: 'wait'});
    assert.equal(game.state.player.elapsedMinutes, 5);
    assert.equal(game.formatClockTime(), '00:03');
    assert.equal(game.state.player.ending, 'too-late');
    assert.equal(game.state.player.gameOver, true);
    assert.deepEqual(game.getEndingText(), ['Dawn has arrived.']);
    assert.deepEqual(ended, ['too-late']);
    assert.equal(scheduled, false);
    assert.equal(saves.at(-1).player.ending, 'too-late');
    game.dispatch({type: 'wait'});
    assert.equal(game.state.player.elapsedMinutes, 5);
    assert.deepEqual(ended, ['too-late']);
});

test('deadline catches skipped minutes and survives a serialized restore', () => {
    const definition = world('04:50', '05:00', 7);
    const game = createGame(definition);
    game.dispatch({type: 'start'});
    game.dispatch({type: 'wait'});
    assert.ok(!game.state.player.gameOver);
    const restored = createGame(definition).load(JSON.parse(JSON.stringify(game.save())));
    restored.dispatch({type: 'wait'});
    assert.equal(restored.state.player.ending, 'too-late');
    assert.equal(restored.state.player.elapsedMinutes, 14);
    assert.equal(restored.formatClockTime(), '05:04');
    const ended = createGame(definition).load(restored.save());
    assert.equal(ended.state.player.ending, 'too-late');
    assert.equal(ended.dispatch({type: 'wait'}).success, false);
    assert.equal(createGame(definition).state.player.elapsedMinutes, 0);
});

test('equal starting and deadline times mean the next day; free and failed actions cost no time', () => {
    const game = createGame(world('05:00', '05:00', 1440));
    game.dispatch({type: 'start'});
    game.dispatch({type: 'look'});
    game.dispatch({type: 'go', target: 'missing'});
    assert.equal(game.state.player.elapsedMinutes, 0);
    assert.ok(!game.state.player.gameOver);
    game.dispatch({type: 'wait'});
    assert.equal(game.state.player.elapsedMinutes, 1440);
    assert.equal(game.state.player.ending, 'too-late');
});

test('an earlier ending stays final and an overdue initial game ends when started', () => {
    const game = createGame(world());
    game.dispatch({type: 'start'});
    game.endGame(game.state.endings[1]);
    game.commitMutation();
    assert.equal(game.state.player.ending, 'won');
    const definition = world();
    definition.player.elapsedMinutes = 10;
    const overdue = createGame(definition);
    overdue.dispatch({type: 'start'});
    assert.equal(overdue.state.player.ending, 'too-late');
});

test('deadline configuration validates in JSON, direct engine input and loaded saves', () => {
    validateWorldData(world());
    for (const change of [
        w => w.clock.deadline = null,
        w => w.clock.deadline = [],
        w => delete w.clock.startTime,
        w => delete w.clock.deadline.time,
        w => w.clock.deadline.time = '24:00',
        w => w.clock.deadline.time = '05:00\n',
        w => delete w.clock.deadline.ending,
        w => w.clock.deadline.ending = '',
        w => w.clock.deadline.extra = true,
    ]) {
        const definition = world();
        change(definition);
        assert.throws(() => validateWorldData(definition), /deadline|startTime/);
        assert.throws(() => createGame(definition), /clock.deadline/);
        const game = createGame(world());
        const saved = game.save();
        change(saved);
        assert.throws(() => game.load(saved), /clock.deadline/);
        assert.throws(() => createGame(saved), /clock.deadline/);
    }
    for (const change of [
        w => w.clock.deadline.ending = 'missing',
        w => w.endings.push({id: 'too-late'}),
    ]) {
        const definition = world();
        change(definition);
        assert.throws(() => createGame(definition), /clock.deadline.ending/);
        const game = createGame(world());
        const saved = game.save();
        change(saved);
        assert.throws(() => game.load(saved), /clock.deadline.ending/);
    }
});
