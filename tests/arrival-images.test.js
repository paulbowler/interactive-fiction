import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, normaliseWorld} from '../packages/engine/index.js';
import {validateWorldData} from '../packages/browser/build.js';

const world = () => ({title: 'Arrival views', player: {room: 'hall'}, rooms: {
    hall: {exits: {gallery: {}}, items: {door: {name: 'door', passage: {destination: 'gallery'}}}},
    courtyard: {exits: {gallery: {}}},
    gallery: {imageUrl: 'default.svg', imagePosition: {x: 'left', y: 'top'},
        imageFrom: {hall: 'hall.svg', courtyard: 'courtyard.svg'},
        imageVariants: [{id: 'night', imageUrl: 'night.svg'}],
        exits: {hall: {}, courtyard: {}, gallery: {}}},
}});
const create = (model = world()) => {
    const game = createGame(model);
    game.available('image', 'gallery', ctx => ctx.state.player.night === true);
    return game;
};
const image = game => game.getRoomImage(game.state.rooms[game.state.player.currentRoom]).imageUrl;

test('arrival views follow go and enter, survive other actions and restore, and yield to variants', () => {
    const game = create();
    assert.equal(game.state.player.previousRoom, null);
    assert.equal(game.getRoomImage(game.state.rooms.gallery).imageUrl, 'default.svg');
    let previousAtEvent;
    game.events.on('playerEnteredRoom', () => {previousAtEvent = game.state.player.previousRoom;});
    assert.equal(game.dispatch({type: 'enter', target: 'door'}).success, true);
    assert.equal(previousAtEvent, 'hall');
    assert.equal(image(game), 'hall.svg');
    assert.deepEqual(game.getRoomImage(game.state.rooms.gallery).imagePosition, {x: 'left', y: 'top'});
    const saved = game.save();
    image(game);
    assert.deepEqual(game.save(), saved, 'image queries are read-only');
    game.dispatch({type: 'look'});
    game.dispatch({type: 'wait'});
    game.dispatch({type: 'go', target: 'gallery'});
    assert.equal(image(game), 'hall.svg', 'same-room actions do not erase the arrival');
    const restored = create().load(JSON.parse(JSON.stringify(game.save())));
    assert.equal(image(restored), 'hall.svg');
    restored.dispatch({type: 'go', target: 'courtyard'});
    restored.dispatch({type: 'go', target: 'gallery'});
    assert.equal(image(restored), 'courtyard.svg');
    restored.state.player.night = true;
    assert.equal(image(restored), 'night.svg');
    restored.state.player.night = false;
    assert.equal(image(restored), 'courtyard.svg');
    restored.state.rooms.gallery.imageFrom = {hall: 'hall.svg'};
    assert.equal(image(restored), 'default.svg');
    const legacy = restored.save();
    delete legacy.player.previousRoom;
    restored.load(legacy);
    assert.equal(restored.state.player.previousRoom, null);
    assert.equal(image(restored), 'default.svg');
});

test('blocked and deferred movement update arrival only on completed movement', () => {
    const model = world();
    model.rooms.hall.exits.gallery = {successMessage: 'You approach.', deferMoveUntilMessageClosed: true};
    const game = create(model);
    const unblock = game.available('go', 'gallery', () => false);
    assert.equal(game.dispatch({type: 'go', target: 'gallery'}).success, false);
    assert.equal(game.state.player.previousRoom, null);
    unblock();
    game.dispatch({type: 'go', target: 'gallery'});
    assert.equal(game.state.player.currentRoom, 'hall');
    assert.equal(game.state.player.previousRoom, null);
    const restored = create(model).load(JSON.parse(JSON.stringify(game.save())));
    assert.equal(restored.dispatch({type: 'acknowledgeMessage'}).success, true);
    assert.equal(image(restored), 'hall.svg');
    restored.movePlayerByEffect({room: 'courtyard'});
    assert.equal(restored.state.player.previousRoom, 'gallery');
    restored.movePlayerByEffect({room: 'gallery'});
    assert.equal(image(restored), 'courtyard.svg');
    restored.movePlayerByEffect({room: 'missing'});
    assert.equal(image(restored), 'courtyard.svg');
});

test('arrival maps validate in authored worlds, canonical input and atomic save loading', () => {
    const model = world();
    assert.equal(validateWorldData(model), model);
    assert.deepEqual(normaliseWorld(model).rooms.gallery.imageFrom, model.rooms.gallery.imageFrom);
    for (const value of [null, [], 'hall.svg', {missing: 'a.svg'}, {hall: ''}, {hall: 7}]) {
        const invalid = world(); invalid.rooms.gallery.imageFrom = value;
        assert.throws(() => normaliseWorld(invalid), /imageFrom/);
        const game = create(), saved = game.save();
        const bad = game.save(); bad.rooms.gallery.imageFrom = value;
        assert.throws(() => game.load(bad), /imageFrom/);
        assert.throws(() => createGame(bad), /imageFrom/);
        assert.deepEqual(game.save(), saved);
    }
    for (const previousRoom of ['missing', '', false, {}, 3]) {
        const invalid = world(); invalid.player.previousRoom = previousRoom;
        assert.throws(() => createGame(invalid), /previousRoom/);
        const game = create(), saved = game.save();
        const bad = game.save(); bad.player.previousRoom = previousRoom;
        assert.throws(() => game.load(bad), /previousRoom/);
        assert.deepEqual(game.save(), saved);
    }
});
