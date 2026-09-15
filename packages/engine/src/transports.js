// Transport state belongs to an entity; occupants belong to its boarding space.
// Object-backed spaces are reserved until player containment supports boarding.
export function transportRoom(t) { return t.space?.room ?? t.room; }
export function transportStop(t) { return t.space ? t.stop : t.currentFloor; }
export function transportOpen(t) { return t.space ? t.boardingOpen : t.doorsOpen; }
export function setTransportStop(t, stop) { t[t.space ? 'stop' : 'currentFloor'] = stop; }
export function setTransportOpen(t, open) { t[t.space ? 'boardingOpen' : 'doorsOpen'] = open; }
export function transportStopRoom(t, stop) { return t.space ? t.stops[stop]?.room : stop; }
export function transportStopAt(t, room) {
    return Object.keys(t.stops).find(stop => transportStopRoom(t, stop) === room);
}

export function validateTransports(model, connections = true) {
    if (model.transports === undefined) {
        for (const room of Object.values(model.rooms || {})) for (const exit of Object.values(room.exits || {}))
            if (exit?.transport) throw new Error('Invalid world: connection refers to missing transports');
        return;
    }
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const check = (valid, path, message) => { if (!valid) throw new Error(`Invalid world at ${path}: ${message}`); };
    check(object(model.transports), 'transports', 'expected an object');
    const itemIds = new Set();
    function items(collection) {
        for (const [id,item] of Object.entries(collection || {})) {
            itemIds.add(id); items(item.properties?.container?.items ?? item.items);
        }
    }
    for (const room of Object.values(model.rooms || {})) items(room.items);
    items(model.player?.carried); items(model.player?.worn);
    const liveIds = new Set(itemIds);
    items(model.items);
    const spaces = new Set();
    for (const [id,t] of Object.entries(model.transports)) {
        const path = `transports.${id}`;
        check(id.trim() && !Object.hasOwn(model.rooms, id) && !itemIds.has(id), path, 'duplicate or conflicting entity ID');
        check(object(t), path, 'expected an object');
        check(t.name === undefined || typeof t.name === 'string', `${path}.name`, 'expected a string');
        check(t.blockedMessage === undefined || typeof t.blockedMessage === 'string', `${path}.blockedMessage`, 'expected a string');
        check(object(t.space) && Object.keys(t.space).length === 1 && typeof t.space.room === 'string' && Object.hasOwn(model.rooms,t.space.room), `${path}.space`, 'expected {room: knownRoomId}; object boarding spaces are not supported yet');
        check(!spaces.has(t.space.room), `${path}.space`, 'boarding space already belongs to another transport');
        spaces.add(t.space.room);
        check(object(t.stops) && Object.keys(t.stops).length, `${path}.stops`, 'expected at least one stop');
        const rooms = new Set();
        for (const [stop,definition] of Object.entries(t.stops)) {
            check(stop.trim() && object(definition) && typeof definition.room === 'string' && Object.hasOwn(model.rooms,definition.room), `${path}.stops.${stop}`, 'expected a known room');
            check(definition.room !== t.space.room && !rooms.has(definition.room), `${path}.stops.${stop}`, 'stops must refer to distinct rooms outside the boarding space');
            rooms.add(definition.room);
            if (connections) for (const [from,to] of [[t.space.room,definition.room],[definition.room,t.space.room]]) {
                const link = model.rooms[from].exits?.[to]?.transport;
                check(link?.id === id && link.stop === stop, `${path}.stops.${stop}`, 'missing or mismatched boarding connection');
            }
        }
        check(typeof t.stop === 'string' && Object.hasOwn(t.stops,t.stop), `${path}.stop`, 'unknown current stop');
        check(typeof t.boardingOpen === 'boolean', `${path}.boardingOpen`, 'expected a boolean');
        check(['idle','moving'].includes(t.phase), `${path}.phase`, 'expected idle or moving');
        check(Array.isArray(t.queue), `${path}.queue`, 'expected an array');
        check(t.dwell === undefined || Number.isSafeInteger(t.dwell) && t.dwell >= 0, `${path}.dwell`, 'expected a nonnegative integer');
        const request = (r,where) => {
            check(object(r) && typeof r.destination === 'string' && Object.hasOwn(t.stops,r.destination), where, 'unknown destination stop');
            check(r.actor === undefined || r.actor === 'player' || liveIds.has(r.actor), where, 'unknown transport actor');
            check(r.dwell === undefined || Number.isSafeInteger(r.dwell) && r.dwell >= 0, where, 'invalid dwell');
            check(r.effects === undefined || Array.isArray(r.effects), where, 'effects must be an array');
        };
        t.queue.forEach((r,i) => request(r,`${path}.queue.${i}`));
        if (t.request !== undefined) request(t.request,`${path}.request`);
        check(t.phase !== 'moving' || t.request && !t.boardingOpen, path, 'moving transport needs a request and closed boarding');
    }
    for (const [roomId, room] of Object.entries(model.rooms)) {
        for (const [destination,exit] of Object.entries(room.exits || {})) {
            if (!exit.transport) continue;
            const link = exit.transport, t = model.transports[link.id];
            check(t && Object.hasOwn(t.stops,link.stop), `rooms.${roomId}.exits.${destination}.transport`, 'unknown transport or stop');
            const outside = t.stops[link.stop].room;
            check(roomId === t.space.room && destination === outside || roomId === outside && destination === t.space.room, `rooms.${roomId}.exits.${destination}.transport`, 'connection does not match the boarding space and stop');
        }
    }
}

export function normaliseTransports(model) {
    if (model.transports === undefined) return;
    for (const [id,t] of Object.entries(model.transports || {})) {
        if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
        if (Array.isArray(t.stops)) {
            const seen = new Set();
            t.stops = Object.fromEntries(t.stops.map((room,index) => {
                const path = `transports.${id}.stops.${index}`;
                if (typeof room !== 'string' || !room.trim()) throw new Error(`Invalid world at ${path}: expected a room ID string`);
                if (seen.has(room)) throw new Error(`Invalid world at ${path}: duplicate stop ${room}`);
                if (['__proto__','constructor','prototype'].includes(room)) throw new Error(`Invalid world at ${path}: unsafe stop ID`);
                seen.add(room);
                return [room,{room}];
            }));
        }
        if (t.boardingOpen === undefined) t.boardingOpen = true;
        if (t.phase === undefined) t.phase = 'idle';
        if (t.queue === undefined) t.queue = [];
    }
    validateTransports(model, false);
    for (const [id,t] of Object.entries(model.transports)) {
        for (const [stop,definition] of Object.entries(t.stops)) {
            for (const [from,to] of [[t.space.room,definition.room],[definition.room,t.space.room]]) {
                const exits = model.rooms[from].exits ||= {};
                const exit = exits[to] ||= {};
                if (exit.transport && (exit.transport.id !== id || exit.transport.stop !== stop)) throw new Error(`Conflicting transport connection: ${from} -> ${to}`);
                exit.transport = {id,stop};
            }
        }
    }
}
