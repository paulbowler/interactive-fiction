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
    // Existing conditional-segment arrays remain readable for compatible saves.
    if (Array.isArray(description) && !isVariantArray(description)) {
        if (description.every(part => typeof part === 'string' || (part && !Array.isArray(part) && typeof part === 'object' && typeof part.text === 'string'))) return;
        throw new Error(`Invalid description at ${path}: invalid text segment`);
    }
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
        items(room?.items, `rooms.${id}.items`);
    }
    items(world.items, 'items');
    items(world.player?.carried, 'player.carried');
    items(world.player?.worn, 'player.worn');
}

export function createDescriptions(game) {
    const resolvers = new Map(), resolving = new Set();
    function find(model, id, includePrototypes = false) {
        const colon = id.indexOf(':');
        if (colon !== -1) {
            const clue = model.rooms?.[id.slice(0, colon)]?.clues?.[id.slice(colon + 1)];
            if (clue) return clue;
        }
        if (Object.hasOwn(model.rooms || {}, id)) return model.rooms[id];
        function visit(collection) {
            if (Object.hasOwn(collection || {}, id)) return collection[id];
            for (const item of Object.values(collection || {})) {
                const found = visit(item.properties?.container?.items);
                if (found) return found;
            }
        }
        return visit(model.player?.carried) || visit(model.player?.worn) ||
            Object.values(model.rooms || {}).map(room => visit(room.items)).find(Boolean) ||
            (includePrototypes ? visit(model.items) : undefined);
    }
    function resolve(id, entity, separateSentences = true) {
        const description = entity?.description;
        validateDescription(description, id || 'clue');
        if (description === undefined || typeof description === 'string' || (Array.isArray(description) && !isVariantArray(description)))
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
        const key = selected === undefined ? 'default' : selected;
        if (typeof key !== 'string' || !Object.hasOwn(catalog, key))
            throw new Error(`Invalid description selection for ${id}: expected an existing variant key, received ${String(key)}`);
        return catalog[key];
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
