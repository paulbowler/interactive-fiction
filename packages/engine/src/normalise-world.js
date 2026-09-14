import { validateWorldDescriptions } from './descriptions.js';
import { cloneSerializable } from './serialization.js';

// Authoring is concise; runtime containment has one owner collection per object.
// An already canonical world/save is cloned without changing its state.
export function normaliseWorld(definition) {
    const world = cloneSerializable(definition);
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const fail = (path, message) => { throw new Error(`Invalid world at ${path}: ${message}`); };
    const record = (value, path) => {
        if (!object(value)) fail(path, 'expected an object');
        return value;
    };
    record(world, 'world');
    validateWorldDescriptions(world);
    if (world.schemaVersion !== undefined && world.schemaVersion !== 1) fail('schemaVersion', 'Unsupported world schema version');
    if (world.player?.currentRoom !== undefined && world.player.room === undefined) return world;
    if (typeof world.title !== 'string' || !world.title.trim()) fail('title', 'expected a nonempty string');
    record(world.player, 'player');
    if (world.player.currentRoom !== undefined) fail('player', 'use room only');
    if (typeof world.player.room !== 'string') fail('player.room', 'expected a room ID string');
    record(world.rooms, 'rooms');
    if (!Object.hasOwn(world.rooms, world.player.room)) fail('player.room', `unknown room ${world.player.room}`);
    if (world.version === undefined) world.version = '1';
    if (world.id !== undefined && (typeof world.id !== 'string' || !world.id.trim())) fail('id', 'expected a nonempty string');
    if (typeof world.version !== 'string' || !world.version.trim()) fail('version', 'expected a string');
    if (world.startScreen === undefined) world.startScreen = { title: world.title };
    record(world.startScreen, 'startScreen');
    if (world.achievements === undefined) world.achievements = {};
    record(world.achievements, 'achievements');
    if (world.endings === undefined) world.endings = [];
    if (!Array.isArray(world.endings)) fail('endings', 'expected an array');
    if (world.clock !== undefined) {
        record(world.clock, 'clock');
        if (world.clock.minutesPerTurn === undefined) world.clock.minutesPerTurn = 1;
        if (!Number.isSafeInteger(world.clock.minutesPerTurn) || world.clock.minutesPerTurn < 1) fail('clock.minutesPerTurn', 'expected a positive integer');
    }
    world.player.currentRoom = world.player.room;
    delete world.player.room;
    if (world.player.elapsedMinutes === undefined) world.player.elapsedMinutes = 0;
    if (!Number.isSafeInteger(world.player.elapsedMinutes) || world.player.elapsedMinutes < 0) fail('player.elapsedMinutes', 'expected a nonnegative integer');

    // Presentation stays on the entity. Capabilities and story state belong to
    // its runtime properties; the author does not need that wrapper.
    const presentation = new Set(['id', 'name', 'article', 'description', 'detail', 'imageUrl', 'imageVariants']);
    const holding = new Set(['items', 'accepts', 'insertable', 'transparent', 'takeLabel']);
    const opening = new Set(['openable', 'opened', 'lockable', 'locked', 'key', 'openMessage', 'closeMessage', 'lockedMessage', 'unlockMessage', 'lockMessage']);
    const booleans = ['portable', 'fixed', 'container', 'supporter', 'door', 'openable', 'opened', 'lockable', 'locked', 'transparent', 'hidden', 'scenery', 'droppable'];
    const live = new Set(), prototypes = new Set(), references = [];
    function items(collection, path, ids) {
        if (collection === undefined) collection = {};
        record(collection, path);
        for (const [id, item] of Object.entries(collection)) {
            const where = `${path}.${id}`;
            if (!id.trim() || ids.has(id) || Object.hasOwn(world.rooms, id)) fail(where, `duplicate or conflicting entity ID ${id}`);
            ids.add(id);
            record(item, where);
            if (item.id !== undefined && item.id !== id) fail(where, 'id must match its collection key');
            if ('location' in item) fail(where, 'use nested items or player inventory to declare location');
            if (item.weight !== undefined && (typeof item.weight !== 'number' || item.weight < 0)) fail(`${where}.weight`, 'expected a nonnegative number');
            if (item.name !== undefined && typeof item.name !== 'string') fail(`${where}.name`, 'expected a string');
            if ('properties' in item) fail(where, 'put capabilities directly on the object');
            for (const key of booleans) if (item[key] !== undefined && typeof item[key] !== 'boolean') fail(`${where}.${key}`, 'expected a boolean');
            if (item.fixed && item.portable) fail(where, 'fixed objects cannot be explicitly portable');
            if (item.locked && !item.lockable) fail(where, 'locked objects must be lockable');
            if (item.key !== undefined && !item.lockable) fail(where, 'key requires lockable');
            if (item.supporter && (item.openable || item.lockable || item.locked || item.opened === false || item.door)) fail(where, 'supporter must hold visible objects without opening or locking');
            if (item.container && item.door) fail(where, 'an object cannot be both a container and a door');
            const holds = item.container || item.supporter;
            const opens = holds || item.door;
            for (const key of holding) if (item[key] !== undefined && !holds) fail(where, `${key} requires container or supporter`);
            for (const key of opening) if (item[key] !== undefined && !opens) fail(where, `${key} requires container, supporter or door`);
            if (item.opened && !item.openable && !holds) fail(where, 'opened door requires openable');
            if (item.locked && item.opened) fail(where, 'a locked object cannot start open');
            if (item.key !== undefined) {
                if (typeof item.key !== 'string') fail(`${where}.key`, 'expected an object ID string');
                references.push([`${where}.key`, item.key]);
            }
            if (item.passage !== undefined && !Object.hasOwn(world.rooms, item.passage?.destination)) fail(`${where}.passage.destination`, 'unknown room');
            const result = {}, properties = {}, capability = {};
            for (const [key, value] of Object.entries(item)) {
                if (presentation.has(key)) result[key] = value;
                else if (key === 'container' || key === 'door') continue;
                else if (key === 'supporter' || holding.has(key) || opening.has(key)) capability[key] = value;
                else properties[key] = value;
            }
            if (holds) {
                capability.items = items(item.items, `${where}.items`, ids);
                if (item.supporter) capability.opened = true;
                properties.container = capability;
            } else if (item.door) properties.door = capability;
            if (item.openable) capability.opened ??= false;
            if (item.lockable) capability.locked ??= false;
            result.properties = properties;
            collection[id] = result;
        }
        return collection;
    }
    for (const [id, room] of Object.entries(world.rooms)) {
        record(room, `rooms.${id}`);
        if (room.exits === undefined) room.exits = {};
        record(room.exits, `rooms.${id}.exits`);
        for (const [destination, exit] of Object.entries(room.exits)) {
            if (!Object.hasOwn(world.rooms, destination)) fail(`rooms.${id}.exits.${destination}`, 'unknown room');
            record(exit, `rooms.${id}.exits.${destination}`);
        }
        room.items = items(room.items, `rooms.${id}.items`, live);
    }
    world.player.carried = items(world.player.carried, 'player.carried', live);
    world.player.worn = items(world.player.worn, 'player.worn', live);
    world.items = items(world.items, 'items', prototypes);
    for (const [path, id] of references) if (!live.has(id) && !prototypes.has(id)) fail(path, `unknown object ${id}`);
    const forbidden = new Set(['onTake', 'onMove', 'beforeOpen', 'afterEnter', 'script', 'callback', 'effects', 'stateRules']);
    function checkData(value, path) {
        if (!object(value) && !Array.isArray(value)) return;
        for (const [key, child] of Object.entries(value)) {
            if (forbidden.has(key)) fail(`${path}.${key}`, 'register behavior in a story module');
            checkData(child, `${path}.${key}`);
        }
    }
    checkData(world, 'world');
    return world;
}
