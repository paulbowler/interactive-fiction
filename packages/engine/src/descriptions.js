import {findEntity as find} from './entities.js';
// Prose is data; a synchronous story resolver selects a named variant.
function isVariantArray(value) {
    return Array.isArray(value) && value.some(part => part && Object.hasOwn(part, 'id'));
}
function variantCatalog(value, path) {
    if (!isVariantArray(value)) return value;
    const catalog = Object.create(null);
    for (const part of value) {
        if (!part || typeof part.id !== 'string' || !part.id.trim() || typeof part.text !== 'string' ||
            Object.keys(part).some(key => key !== 'id' && key !== 'text'))
            throw new Error(`Invalid description at ${path}: variants need only an id and text`);
        if (Object.hasOwn(catalog, part.id)) throw new Error(`Invalid description at ${path}: duplicate variant ${part.id}`);
        catalog[part.id] = part.text;
    }
    return catalog;
}
export function validateDescription(description, path) {
    if (description === undefined || typeof description === 'string') return;
    description = variantCatalog(description, path);
    if (!description || typeof description !== 'object' || !Object.hasOwn(description, 'default'))
        throw new Error(`Invalid description at ${path}: expected a string or variants with a default`);
    for (const [key, text] of Object.entries(description)) {
        if (!key.trim() || typeof text !== 'string') throw new Error(`Invalid description at ${path}.${key}: variants must be named strings`);
    }
}

export function validateWorldDescriptions(world) {
    function entity(value, path) { if (value) validateDescription(value.description, `${path}.description`); }
    function items(collection, path) {
        for (const [id, item] of Object.entries(collection || {})) {
            entity(item, `${path}.${id}`);
            items(item?.properties?.container?.items || item?.items, `${path}.${id}.items`);
        }
    }
    for (const [id, room] of Object.entries(world.rooms || {})) {
        entity(room, `rooms.${id}`);
        for (const [key, clue] of Object.entries(room?.clues || {})) entity(clue, `rooms.${id}.clues.${key}`);
        for (const [key, feature] of Object.entries(room?.scenery || {})) entity(feature, `rooms.${id}.scenery.${key}`);
        items(room?.items, `rooms.${id}.items`);
    }
    items(world.items, 'items');
    items(world.player?.carried, 'player.carried');
    items(world.player?.worn, 'player.worn');
}

export function createDescriptions(game) {
    const resolvers = new Map(), resolving = new Set();
    function resolve(id, entity, separateSentences = true) {
        const description = entity?.description;
        validateDescription(description, id || 'clue');
        if (description === undefined || typeof description === 'string')
            return game.buildConditionalText(description, separateSentences);
        const catalog = variantCatalog(description, id);
        let selected;
        const resolver = resolvers.get(id);
        if (resolver) {
            if (resolving.has(id)) throw new Error(`Recursive description resolver: ${id}`);
            resolving.add(id);
            try {
                selected = resolver({ ...game.context({ type: 'describe', actor: 'player', target: id }),
                    target: entity, definition: find(game.world, id, true) });
            } finally { resolving.delete(id); }
        }
        const keys = selected === undefined ? ['default'] : Array.isArray(selected) ? selected : [selected];
        for (const key of keys) {
            if (typeof key !== 'string' || !Object.hasOwn(catalog, key))
                throw new Error(`Invalid description selection for ${id}: expected an existing variant key, received ${String(key)}`);
        }
        if (new Set(keys).size !== keys.length) throw new Error(`Duplicate description selection for ${id}`);
        return game.buildConditionalText(keys.map(key => catalog[key]), separateSentences);
    }
    return {
        describe(id, resolver) {
            if (typeof id !== 'string' || !id.trim() || typeof resolver !== 'function' || resolver.constructor.name === 'AsyncFunction')
                throw new TypeError('Description registration needs an ID and synchronous resolver');
            if (resolvers.has(id)) throw new Error(`Duplicate description resolver: ${id}`);
            resolvers.set(id, resolver);
            return () => { if (resolvers.get(id) === resolver) resolvers.delete(id); };
        },
        getDescription(id) {
            if (typeof id !== 'string' || !id.trim()) throw new TypeError('Description target must be an ID string');
            const entity = find(game.state, id);
            if (!entity) throw new Error(`Unknown description target: ${id}`);
            return resolve(id, entity, !Object.hasOwn(game.state.rooms, id));
        },
        resolve,
        clue(clue) {
            for (const [room, definition] of Object.entries(game.state.rooms)) {
                for (const [key, candidate] of Object.entries(definition.clues || {})) {
                    if (candidate === clue) return resolve(`${room}:${key}`, clue);
                }
            }
            return resolve(undefined, clue);
        }
    };
}
