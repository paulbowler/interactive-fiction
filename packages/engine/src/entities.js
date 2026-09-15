// Query the canonical model without caching mutable object references.
export function findEntity(model, id, includePrototypes = false) {
    if (typeof id !== 'string') return undefined;
    const colon = id.indexOf(':');
    if (colon !== -1) {
        const scenery = model.rooms?.[id.slice(0, colon)]?.clues?.[id.slice(colon + 1)];
        if (scenery) return scenery;
    }
    if (Object.hasOwn(model.rooms || {}, id)) return model.rooms[id];
    if (Object.hasOwn(model.transports || {}, id)) return model.transports[id];
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
