import { transportRoom, transportStop, transportOpen, setTransportStop, setTransportOpen, transportStopRoom, transportStopAt } from './transports.js';
// Existing transport and NPC mission state machines. Every phase, queue,
// countdown and boarding stage lives in serializable runtime state.
export function createWorldEvents(runtime) {
function getTransport(id) {
    if (typeof id !== 'string') return undefined;
    const transports = runtime.state.transports;
    return transports && Object.hasOwn(transports,id) ? transports[id] : undefined;
}
function transportEntries() {
    return Object.entries(runtime.state.transports || {}).map(([id, transport]) => ({id,transport}));
}
function transportConnectionOpen(link) {
    const t = getTransport(link.id);
    return Boolean(t && t.phase === 'idle' && transportOpen(t) && transportStop(t) === link.stop);
}
function getMissionRoute(config, from, to) {
    const queue = [{ room: from, path: [] }];
    const seen = new Set([from]);
    while (queue.length) {
        const current = queue.shift();
        if (current.room === to) return current.path;
        for (const edge of config.routes[current.room] || []) {
            if (seen.has(edge.to)) continue;
            seen.add(edge.to);
            queue.push({ room: edge.to, path: [...current.path, edge] });
        }
    }
    return null;
}

function emitNpcReport(key, texts) {
    const npc = runtime.findItemInGameModel(key)?.properties?.npc;
    if (!runtime.isAvailable({type: 'npcCue', target: key, option: 'turn'})) return;
    const text = runtime.chooseVariedText(texts, npc.lastMissionReport);
    if (!text) return;
    npc.lastMissionReport = text;
    runtime.state.player.movementCues ||= [];
    // A deliberate report supersedes incidental movement sound this turn.
    runtime.state.player.movementCues = runtime.state.player.movementCues.filter(cue => cue.source !== key || !cue.fresh);
    runtime.state.player.movementCues.push({ source: key, text, kind: 'turn', fresh: true });
}

function startMission(effect) {
    const location = runtime.findItem(effect.item);
    const npc = location?.item.properties?.npc;
    const config = npc?.missions;
    const destination = config?.destinations?.[effect.destination];
    const unavailable = npc?.mission?.active || npc?.completed?.[effect.destination];
    if (!destination || (!effect.force && unavailable) ||
        !runtime.isAvailable({type: 'mission', target: effect.item, option: effect.destination}) ||
        !getMissionRoute(config, location.owner.key, destination.room)) return false;
    delete location.item.properties.timer;
    npc.mission = { active: true, destination: effect.destination, phase: 'outbound', justStarted: true };
    if (destination.departureReply) npc.mission.replyPending = true;
    npc.state = config.states.outbound;
    emitNpcReport(effect.item, destination.departure);
    return true;
}

function finishMission(key, npc) {
    npc.mission.active = false;
    npc.state = npc.missions.idleState;
    emitNpcReport(key, npc.missions.homeReport);
}

function advanceMissionTransport(key, npc, edge, room) {
    const mission = npc.mission;
    const transport = getTransport(edge.transport);
    if (!transport) return;
    if (!mission.ride) {
        mission.ride = { edge: runtime.cloneModel(edge), origin: room, stage: 'waiting' };
        requestTransport({ transport: edge.transport, destination: transportStopAt(transport, room), actor: key, dwell: 1 });
        return;
    }
    const ride = mission.ride;
    const stopped = room => transport.phase === 'idle' && transportOpen(transport) && transportStopRoom(transport, transportStop(transport)) === room;
    if (ride.stage === 'waiting' && stopped(ride.origin)) {
        ride.stage = 'ready';
        transport.dwell = Math.max(transport.dwell || 0, 1);
    } else if (ride.stage === 'ready' && !stopped(ride.origin)) {
        ride.stage = 'waiting';
    } else if (ride.stage === 'ready' && stopped(ride.origin)) {
        runtime.moveItem(key, runtime.state.rooms[transportRoom(transport)].items);
        ride.stage = 'boarded';
        // Boarding and requesting a destination are separate turns.
        transport.dwell = Math.max(transport.dwell || 0, 1);
    } else if (ride.stage === 'boarded') {
        requestTransport({ transport: edge.transport, destination: transportStopAt(transport, edge.to), actor: key, dwell: 1 });
        ride.stage = 'riding';
    } else if (ride.stage === 'riding' && stopped(edge.to)) {
        runtime.moveItem(key, runtime.state.rooms[edge.to].items);
        delete mission.ride;
    } else if (ride.stage === 'waiting' && transport.phase === 'idle' && !transport.queue?.length) {
        // A player may depart before boarding; request its return instead of teleporting.
        requestTransport({ transport: edge.transport, destination: transportStopAt(transport, ride.origin), actor: key, dwell: 1 });
    }
}

function advanceMissions() {
    if (runtime.state.player.gameOver) return;
    const actors = [];
    runtime.getAllRootItemCollections().forEach(items => runtime.collectItemsInCollection(items,
        item => Boolean(item.properties?.npc?.mission?.active), actors));
    for (const { key, item } of actors) {
        const npc = item.properties.npc, mission = npc.mission, config = npc.missions;
        // A physical interruption may replace the task. An unfinished check remains available.
        if (npc.state !== config.states[mission.phase]) { mission.active = false; continue; }
        if (mission.justStarted) { delete mission.justStarted; continue; }
        const destination = config.destinations[mission.destination];
        if (mission.replyPending) {
            delete mission.replyPending;
            emitNpcReport(key, destination.departureReply);
            continue;
        }
        const room = runtime.findItem(key).owner.key;
        if (mission.phase === 'searching') {
            if (--mission.remaining > 0) continue;
            npc.completed ||= {};
            npc.completed[mission.destination] = true;
            mission.phase = 'returning'; npc.state = config.states.returning;
            emitNpcReport(key, mission.finished || destination.finished);
            continue;
        }
        if (mission.ride) {
            advanceMissionTransport(key, npc, mission.ride.edge, room);
            continue;
        }
        const target = mission.phase === 'returning' ? config.home : destination.room;
        const route = getMissionRoute(config, room, target);
        if (!route) {
            emitNpcReport(key, config.blockedReport);
            mission.active = false; npc.state = config.idleState;
            continue;
        }
        if (route.length) {
            const edge = route[0];
            if (edge.transport) { advanceMissionTransport(key, npc, edge, room); continue; }
            runtime.events.emit('missionStepStarted', {actor:key, from:room, to:edge.to, destination:mission.destination, phase:mission.phase});
            runtime.moveItem(key, runtime.state.rooms[edge.to].items);
            if (edge.to !== target) continue;
        }
        if (mission.phase === 'returning') finishMission(key, npc);
        else {
            mission.phase = 'searching'; npc.state = config.states.searching;
            const variant = (destination.variants || []).find(variant => (!variant.id || runtime.isAvailable({type: 'missionVariant', target:key, secondaryTarget:mission.destination, option:variant.id})));
            const visit = { ...destination, ...variant };
            mission.remaining = visit.searchTurns;
            mission.finished = runtime.cloneModel(visit.finished || []);
            emitNpcReport(key, visit.arrival);
            runtime.events.emit('missionArrived', {actor:key, destination:mission.destination, room:target, variant:runtime.cloneModel(variant || null)});
        }
    }
}

function requestTransport(effect = {}) {
    if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return false;
    const transport = getTransport(effect.transport ?? effect.item);
    if (!transport || typeof effect.destination !== 'string' || !Object.hasOwn(transport.stops, effect.destination) || (effect.condition && !runtime.testPredicate(effect.condition))) return false;
    if (effect.effects !== undefined) return false;
    if (effect.dwell !== undefined && (!Number.isSafeInteger(effect.dwell) || effect.dwell < 0)) return false;
    if (effect.actor && effect.actor !== 'player' && !runtime.findItem(effect.actor)) return false;
    if (effect.event !== undefined && (typeof effect.event !== 'string' || !effect.event.trim())) return false;
    transport.queue ||= [];
    const actor = effect.actor || 'player';
    const duplicate = request => request?.destination === effect.destination && request.actor === actor;
    if (duplicate(transport.request) || transport.queue.some(duplicate)) return false;
    transport.queue.push({ destination: effect.destination, actor,
        dwell: effect.dwell || 0, condition: runtime.cloneModel(effect.condition || null),
        ...(effect.event ? {event:effect.event, data:runtime.cloneModel(effect.data ?? null)} : {}) });
    return true;
}

// Entering an open boarding space holds it for this action without cancelling requests.

function holdTransportForBoarding(room) {
    for (const {transport} of transportEntries().filter(({transport}) => transportRoom(transport) === room)) {
        if (transport.phase === 'idle' && transportOpen(transport)) transport.dwell = Math.max(transport.dwell || 0, 1);
    }
}

function advanceTransports() {
    for (const {id,transport} of transportEntries()) {
        if (transport.phase === 'moving') {
            const request = transport.request;
            setTransportStop(transport, request.destination);
            transport.phase = 'idle';
            setTransportOpen(transport, true);
            transport.dwell = request.dwell;
            // Retain the request while callbacks and observation conditions run.
            if (!request.condition || runtime.testPredicate(request.condition)) {
                if (request.event) runtime.events.emit(request.event, request.data);
            }
            delete transport.request;
            runtime.events.emit('transportArrived', {transport:id, stop:transport.stop, actor:request.actor});
            continue;
        }
        if (transport.dwell > 0) { transport.dwell--; continue; }
        let request;
        while (transport.queue?.length && !request) {
            const candidate = transport.queue.shift();
            if (!candidate.condition || runtime.testPredicate(candidate.condition)) request = candidate;
        }
        if (!request) continue;
        transport.request = request;
        if (transportStop(transport) === request.destination) {
            const wasOpen = transportOpen(transport);
            setTransportOpen(transport, true);
            transport.dwell = request.dwell;
            if (request.event) runtime.events.emit(request.event, request.data);
            if (!wasOpen) {
                runtime.events.emit('transportOpened', {transport:id, stop:transport.stop, actor:request.actor});
            }
            delete transport.request;
            continue;
        }
        setTransportOpen(transport, false);
        transport.phase = 'moving';
        runtime.events.emit('transportDeparted', {transport:id, from:transport.stop, destination:request.destination, actor:request.actor});
    }
}

function startTimer(effect) {
    const item = runtime.findItemInGameModel(effect.item);
    if (!item?.properties || !Number.isFinite(effect.turns)) {
        return;
    }

    if (effect.effects !== undefined) throw new TypeError('Timer consequences require an event');
    if (effect.event !== undefined && (typeof effect.event !== 'string' || !effect.event.trim())) throw new TypeError('Timer event must be a nonempty string');
    if (effect.justStarted !== undefined && typeof effect.justStarted !== 'boolean') throw new TypeError('Timer grace must be a boolean');
    item.properties.timer = {
        remaining: Math.max(0, Math.floor(effect.turns)),
        ...(effect.event ? {event: effect.event, data: runtime.cloneModel(effect.data ?? null)} : {}),
        justStarted: effect.justStarted ?? true,
        ...(effect.waitUntil ? { waitUntil: runtime.cloneModel(effect.waitUntil) } : {})
    };
}

function advanceTimers() {
    const timers = [];
    runtime.collectTimersInItems(runtime.getAllRootItemCollections(), timers);

    timers.forEach(({ item }) => {
        const timer = item.properties?.timer;
        if (!timer) {
            return;
        }

        if (timer.justStarted) {
            timer.justStarted = false;
            return;
        }

        timer.remaining = Math.max(0, (timer.remaining || 0) - 1);

        if (timer.remaining === 0 && (!timer.waitUntil || runtime.testPredicate(timer.waitUntil))) {
            delete item.properties.timer;
            if (timer.event) runtime.events.emit(timer.event, timer.data);
        }
    });
}
return { getTransport, transportConnectionOpen, getMissionRoute, emitNpcReport, startMission, finishMission, advanceMissionTransport, advanceMissions, requestTransport, holdTransportForBoarding, advanceTransports, startTimer, advanceTimers };
}
