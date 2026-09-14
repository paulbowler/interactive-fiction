// Existing transport and NPC mission state machines. Every phase, queue,
// countdown and boarding stage lives in serializable runtime state.
export function createWorldEvents(runtime) {
function getMissionRoute(config, from, to) {
    const queue = [{ room: from, path: [] }];
    const seen = new Set([from]);
    while (queue.length) {
        const current = queue.shift();
        if (current.room === to) return current.path;
        for (const edge of config.routes[current.room] || []) {
            if (seen.has(edge.to) || (edge.condition && !runtime.evaluateCondition(edge.condition))) continue;
            seen.add(edge.to);
            queue.push({ room: edge.to, path: [...current.path, edge] });
        }
    }
    return null;
}

function emitNpcReport(key, texts) {
    const npc = runtime.findItemInGameModel(key)?.properties?.npc;
    const condition = npc?.turnCue?.condition;
    if (condition && !runtime.evaluateCondition(condition)) return;
    const text = runtime.chooseVariedText(texts, npc.lastMissionReport);
    if (!text) return;
    npc.lastMissionReport = text;
    runtime.state.player.movementCues ||= [];
    // A deliberate report supersedes incidental movement sound this turn.
    runtime.state.player.movementCues = runtime.state.player.movementCues.filter(cue => cue.source !== key || !cue.fresh);
    runtime.state.player.movementCues.push({ source: key, text, condition: runtime.cloneModel(condition || null), fresh: true });
}

function startMission(effect) {
    const location = runtime.findItem(effect.item);
    const npc = location?.item.properties?.npc;
    const config = npc?.missions;
    const destination = config?.destinations?.[effect.destination];
    const repeatAllowed = destination?.repeatWhen && runtime.evaluateCondition(destination.repeatWhen);
    const unavailable = npc?.mission?.active || (npc?.completed?.[effect.destination] && !repeatAllowed);
    if (!destination || (!effect.force && unavailable) ||
        (destination.condition && !runtime.evaluateCondition(destination.condition)) ||
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
    const transport = runtime.findItemInGameModel(edge.transport)?.properties?.transport;
    if (!transport) return;
    if (!mission.ride) {
        mission.ride = { edge: runtime.cloneModel(edge), origin: room, stage: 'waiting' };
        requestTransport({ item: edge.transport, destination: room, actor: key, dwell: 1 });
        return;
    }
    const ride = mission.ride;
    const stopped = floor => transport.phase === 'idle' && transport.doorsOpen && transport.currentFloor === floor;
    if (ride.stage === 'waiting' && stopped(ride.origin)) {
        ride.stage = 'ready';
        transport.dwell = Math.max(transport.dwell || 0, 1);
    } else if (ride.stage === 'ready' && !stopped(ride.origin)) {
        ride.stage = 'waiting';
    } else if (ride.stage === 'ready' && stopped(ride.origin)) {
        runtime.moveItem(key, runtime.state.rooms[transport.room].items);
        ride.stage = 'boarded';
        // Boarding and pressing a floor button are separate turns.
        transport.dwell = Math.max(transport.dwell || 0, 1);
    } else if (ride.stage === 'boarded') {
        requestTransport({ item: edge.transport, destination: edge.to, actor: key, dwell: 1 });
        ride.stage = 'riding';
    } else if (ride.stage === 'riding' && stopped(edge.to)) {
        runtime.moveItem(key, runtime.state.rooms[edge.to].items);
        delete mission.ride;
    } else if (ride.stage === 'waiting' && transport.phase === 'idle' && !transport.queue?.length) {
        // A player may take the car before boarding; call it back instead of teleporting.
        requestTransport({ item: edge.transport, destination: ride.origin, actor: key, dwell: 1 });
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
            (edge.effects || []).forEach(runtime.performEffect);
            runtime.moveItem(key, runtime.state.rooms[edge.to].items);
            if (edge.to !== target) continue;
        }
        if (mission.phase === 'returning') finishMission(key, npc);
        else {
            mission.phase = 'searching'; npc.state = config.states.searching;
            const visit = { ...destination, ...(destination.variants || []).find(variant => runtime.evaluateCondition(variant.condition)) };
            mission.remaining = visit.searchTurns;
            mission.finished = runtime.cloneModel(visit.finished || []);
            emitNpcReport(key, visit.arrival);
            (visit.effects || []).forEach(runtime.performEffect);
        }
    }
}

function requestTransport(effect) {
    const transport = runtime.findItemInGameModel(effect.item)?.properties?.transport;
    if (!transport?.stops?.[effect.destination] || (effect.condition && !runtime.evaluateCondition(effect.condition))) return false;
    transport.queue ||= [];
    const actor = effect.actor || 'player';
    const duplicate = request => request?.destination === effect.destination && request.actor === actor;
    if (duplicate(transport.request) || transport.queue.some(duplicate)) return false;
    transport.queue.push({ destination: effect.destination, actor,
        dwell: effect.dwell || 0, effects: runtime.cloneModel(effect.effects || []), condition: runtime.cloneModel(effect.condition || null) });
    return true;
}

function recordTransportNotice(transport, event) {
    for (const notice of transport.notices?.[event] || []) {
        if (notice.room !== runtime.state.player.currentRoom ||
            (notice.condition && !runtime.evaluateCondition(notice.condition))) continue;
        const text = runtime.buildConditionalText(notice.text);
        if (text) runtime.state.player.turnObservations.push({ room: notice.room, text });
    }
}

// Crossing an open threshold holds the car for this action, without cancelling requests.

function holdTransportForBoarding(room) {
    const controllers = [];
    runtime.getAllRootItemCollections().forEach(items => runtime.collectItemsInCollection(items,
        item => item.properties?.transport?.room === room, controllers));
    for (const { item } of controllers) {
        const transport = item.properties.transport;
        if (transport.phase === 'idle' && transport.doorsOpen) transport.dwell = Math.max(transport.dwell || 0, 1);
    }
}

function advanceTransports() {
    const controllers = [];
    runtime.getAllRootItemCollections().forEach(items => runtime.collectItemsInCollection(items,
        item => Boolean(item.properties?.transport), controllers));
    for (const { item } of controllers) {
        const transport = item.properties.transport;
        if (transport.phase === 'moving') {
            const request = transport.request;
            transport.currentFloor = request.destination;
            transport.phase = 'idle';
            transport.doorsOpen = true;
            transport.dwell = request.dwell;
            // Retain the request while callbacks and observation conditions run.
            if (!request.condition || runtime.evaluateCondition(request.condition)) (request.effects || []).forEach(runtime.performEffect);
            recordTransportNotice(transport, 'arrival');
            delete transport.request;
            continue;
        }
        if (transport.dwell > 0) { transport.dwell--; continue; }
        let request;
        while (transport.queue?.length && !request) {
            const candidate = transport.queue.shift();
            if (!candidate.condition || runtime.evaluateCondition(candidate.condition)) request = candidate;
        }
        if (!request) continue;
        transport.request = request;
        if (transport.currentFloor === request.destination) {
            const wasOpen = transport.doorsOpen;
            transport.doorsOpen = true;
            transport.dwell = request.dwell;
            (request.effects || []).forEach(runtime.performEffect);
            if (!wasOpen) recordTransportNotice(transport, 'opening');
            delete transport.request;
            continue;
        }
        transport.doorsOpen = false;
        transport.phase = 'moving';
        (transport.stops[request.destination].effects || []).forEach(runtime.performEffect);
        recordTransportNotice(transport, 'departure');
    }
}

function startTimer(effect) {
    const item = runtime.findItemInGameModel(effect.item);
    if (!item?.properties || !Number.isFinite(effect.turns)) {
        return;
    }

    item.properties.timer = {
        remaining: Math.max(0, Math.floor(effect.turns)),
        effects: Array.isArray(effect.effects) ? effect.effects : [],
        justStarted: true,
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

        if (timer.remaining === 0 && (!timer.waitUntil || runtime.evaluateCondition(timer.waitUntil))) {
            const effects = Array.isArray(timer.effects) ? timer.effects : [];
            delete item.properties.timer;
            effects.forEach(runtime.performEffect);
        }
    });
}
return { getMissionRoute, emitNpcReport, startMission, finishMission, advanceMissionTransport, advanceMissions, requestTransport, recordTransportNotice, holdTransportForBoarding, advanceTransports, startTimer, advanceTimers };
}
