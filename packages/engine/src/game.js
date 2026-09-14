import { createDescriptions, validateWorldDescriptions } from './descriptions.js';
import { normaliseWorld } from './normalise-world.js';
import { cloneSerializable, validateRuntime } from './serialization.js';
import { createActions } from './actions.js';
import { installDispatcher } from './dispatcher.js';
import { createWorldEvents } from './world-events.js';
import { createEvents } from './events.js';
import { createScheduler } from './scheduler.js';

// One isolated runtime per game. The authored world is never mutated.
export function createGame(world, options = {}) {
if (options.seed !== undefined && (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)) throw new Error('Invalid random seed');
world = normaliseWorld(world);
let gameModel = cloneModel(world);
validateRuntime(gameModel);
let dispatching = false;
let pendingCommit = null;
let hooks = {};
const scripts = new Map();
const PLAYER_COLLECTIONS = ['carried', 'worn'];
const output = (type, ...args) => { hooks[type]?.(...args); };
const updateView = () => output('updateView');
const saveGameModel = () => output('saveGameModel');
const displayMessageModal = (...args) => { api.messages.push({ type: 'message', args }); output('displayMessageModal', ...args); };
const displayAchievementPopup = achievement => { api.events.emit('achievementEarned', achievement); output('displayAchievementPopup', achievement); };
const showItemChoiceOptions = (itemKey, choiceIndex) => { output('showItemChoiceOptions', itemKey, choiceIndex); return getItemChoiceOptions(itemKey, choiceIndex); };
const requestTextInput = input => { output('requestTextInput', input); return null; };
function random() {
    // Seed belongs to the save so restoring also restores prose variation.
    const s = gameModel.runtime ||= {};
    s.randomSeed = ((s.randomSeed ?? options.seed ?? 123456789) * 1664525 + 1013904223) >>> 0;
    return s.randomSeed / 4294967296;
}
function cloneModel(model) {
    return cloneSerializable(model);
}

function validateWorld(model, referenceModel = model) {
    validateWorldDescriptions(model);
    const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const require = (valid, message) => { if (!valid) throw new Error(`Invalid world: ${message}`); };
    require(object(model) && typeof model.version === 'string', 'version is required');
    require(object(model.rooms) && object(model.player) && object(model.items), 'rooms, items and player must be objects');
    require(object(model.achievements) && Array.isArray(model.endings), 'achievements and endings are required');
    require(object(model.startScreen), 'startScreen is required');
    if (model.clock) require(object(model.clock) && Number.isInteger(model.clock.minutesPerTurn) && model.clock.minutesPerTurn > 0, 'invalid clock rate');
    if (model.clock?.notices !== undefined) {
        require(Array.isArray(model.clock.notices), 'clock notices must be an array');
        model.clock.notices.forEach(notice => {
            require(object(notice) && Number.isInteger(notice.minute) && notice.minute > 0, 'invalid clock notice minute');
            require(typeof notice.text === 'string' || Array.isArray(notice.text), 'invalid clock notice text');
        });
    }
    if (model.player.elapsedMinutes !== undefined) require(Number.isInteger(model.player.elapsedMinutes) && model.player.elapsedMinutes >= 0, 'invalid elapsed time');
    require(model.player.achievements === undefined || object(model.player.achievements), 'player achievements must be an object');
    require(model.id === undefined || (typeof model.id === 'string' && model.id.length > 0), 'id must be a nonempty string');
    require(Boolean(model.rooms[model.player.currentRoom]), 'player room does not exist');
    if (model.player.visitedRooms !== undefined) {
        require(object(model.player.visitedRooms), 'visited rooms must be an object');
        Object.entries(model.player.visitedRooms).forEach(([room, visited]) => require(Boolean(model.rooms[room]) && visited === true, 'invalid visited room'));
    }
    const liveIds = new Set();
    const definitions = new Map();
    function visitItems(items, ids) {
        if (items === undefined) return;
        require(object(items), 'item collections must be objects');
        Object.entries(items).forEach(([id, item]) => {
            require(!ids.has(id), `duplicate live item ${id}`);
            ids.add(id);
            definitions.set(id, item);
            require(object(item) && object(item.properties || {}), `invalid item ${id}`);
            if (item.properties?.passage) require(Boolean(model.rooms[item.properties.passage.destination]), `unknown passage destination on ${id}`);
            const container = item.properties?.container;
            if (container?.takeLabel !== undefined) require(typeof container.takeLabel === 'string' && container.takeLabel.trim().length > 0, `invalid removal label on ${id}`);
            if (container?.supporter) require(container.opened === true && !container.openable && !container.lockable && !container.locked, `supporter ${id} must be permanently open`);
            if (item.properties?.readable) require(typeof item.properties.readable.text === 'string' || Array.isArray(item.properties.readable.text), `readable ${id} needs text`);
            visitItems(container?.items, ids);
        });
    }
    Object.values(model.rooms).forEach((room) => {
        require(object(room) && object(room.exits), 'rooms need exits');
        if (room.imageVariants !== undefined) require(Array.isArray(room.imageVariants) && room.imageVariants.every(variant => object(variant) && typeof variant.imageUrl === 'string' && variant.imageUrl.trim()), 'invalid room image variants');
        Object.keys(room.exits).forEach((id) => require(Boolean(model.rooms[id]), `unknown exit ${id}`));
        visitItems(room.items, liveIds);
    });
    visitItems(model.player.carried, liveIds);
    visitItems(model.player.worn, liveIds);
    const ids = new Set(liveIds);
    Object.entries(model.items).forEach(([id, item]) => {
        const prototypeIds = new Set();
        visitItems({ [id]: item }, prototypeIds);
        prototypeIds.forEach((key) => ids.add(key));
    });
    function collectReferenceIds(value) {
        if (!value || typeof value !== 'object') return;
        if (value.items && typeof value.items === 'object') Object.keys(value.items).forEach((id) => ids.add(id));
        if (value.type === 'setItemId' && typeof value.to === 'string') ids.add(value.to);
        Object.values(value).forEach(collectReferenceIds);
    }
    collectReferenceIds(referenceModel);
    Object.keys(referenceModel.player.carried || {}).forEach((id) => ids.add(id));
    Object.keys(referenceModel.player.worn || {}).forEach((id) => ids.add(id));
    function validateTransportRequest(request, transport) {
        require(object(request) && Boolean(transport.stops[request.destination]), 'unknown transport stop');
        require(request.actor === undefined || request.actor === 'player' || liveIds.has(request.actor), 'unknown transport actor');
        require(request.dwell === undefined || (Number.isInteger(request.dwell) && request.dwell >= 0), 'invalid transport dwell');
        require(request.effects === undefined || Array.isArray(request.effects), 'transport arrival effects must be an array');
    }
    definitions.forEach(item => {
        const transport = item.properties?.transport;
        if (!transport) return;
        require(object(transport) && Boolean(model.rooms[transport.room]), 'unknown transport room');
        require(object(transport.stops) && Object.keys(transport.stops).length > 0, 'transport needs stops');
        Object.keys(transport.stops).forEach(stop => require(Boolean(model.rooms[stop]), 'unknown transport stop room'));
        require(Boolean(transport.stops[transport.currentFloor]), 'unknown current transport stop');
        require(typeof transport.doorsOpen === 'boolean' && ['idle', 'moving'].includes(transport.phase), 'invalid transport state');
        require(Array.isArray(transport.queue), 'transport needs a request queue');
        require(transport.dwell === undefined || (Number.isInteger(transport.dwell) && transport.dwell >= 0), 'invalid transport dwell');
        transport.queue.forEach(request => validateTransportRequest(request, transport));
        if (transport.request) validateTransportRequest(transport.request, transport);
        if (transport.phase === 'moving') require(transport.request && !transport.doorsOpen, 'moving transport needs a request and closed doors');
    });
    definitions.forEach((item, id) => {
        const properties = item.properties || {};
        if (properties.onMove !== undefined) {
            const move = properties.onMove;
            require(object(move) && Array.isArray(move.effects), `invalid movement effects on ${id}`);
            for (const field of ['from', 'to']) {
                if (move[field] !== undefined) require(Boolean(model.rooms[move[field]]), `unknown movement room on ${id}`);
            }
        }
        if (properties.textValue !== undefined) require(typeof properties.textValue === 'string', `invalid recorded text on ${id}`);
        if (properties.textInputTargets !== undefined) require(Array.isArray(properties.textInputTargets) && properties.textInputTargets.every(key => typeof key === 'string' && ids.has(key)), `invalid text input targets on ${id}`);
        if (properties.textInputLabel !== undefined) require(typeof properties.textInputLabel === 'string', `invalid text input label on ${id}`);
        if (properties.droppable !== undefined) require(typeof properties.droppable === 'boolean', `invalid droppable on ${id}`);
        if (properties.recordable) {
            const records = Array.isArray(properties.recordable) ? properties.recordable : [properties.recordable];
            require(records.length > 0, `empty note choices on ${id}`);
            records.forEach(record => {
                require(object(record) && object(model.items[record.entry]), `unknown note prototype on ${id}`);
                if (record.buttonLabel !== undefined) require(typeof record.buttonLabel === 'string', `invalid note button on ${id}`);
                if (record.offerInput !== undefined) require(typeof record.offerInput === 'boolean', `invalid note input offer on ${id}`);
                if (record.label !== undefined) require(typeof record.label === 'string', `invalid note label on ${id}`);
                if (record.onExamine !== undefined) require(typeof record.onExamine === 'boolean', `invalid note display on ${id}`);
                require(ids.has(record.container) && (!definitions.has(record.container) || Boolean(definitions.get(record.container).properties?.container)), `unknown notebook on ${id}`);
            });
        }
        if (properties.input?.notesOnly !== undefined) require(typeof properties.input.notesOnly === 'boolean', `invalid notesOnly on ${id}`);
    });
    const conditionTypes = new Set(['hasItem', 'ownsItem', 'itemInContainer', 'itemInRoom', 'itemConnected', 'itemExists', 'currentRoom', 'roomVisited', 'clueExamined', 'itemState', 'elapsedTime', 'all', 'any', 'not', 'requirements']);
    function condition(value) {
        require(object(value), 'condition must be an object');
        if (typeof value.predicate === 'string') { require(scripts.has(value.predicate), `unknown predicate ${value.predicate}`); return; }
        require(!value.type || conditionTypes.has(value.type), `unknown condition ${value.type}`);
        if (value.item) require(ids.has(value.item), `unknown condition item ${value.item}`);
        if (value.container) require(ids.has(value.container), `unknown container ${value.container}`);
        if (value.target) require(ids.has(value.target), `unknown target ${value.target}`);
        if (value.room) require(Boolean(model.rooms[value.room]), `unknown room ${value.room}`);
        if (value.type === 'clueExamined') require(Boolean(model.rooms[value.room]?.clues?.[value.clue]), `unknown clue ${value.clue}`);
        if (['all', 'any', 'requirements'].includes(value.type)) {
            const children = value.type === 'requirements' ? value.requirements : value.conditions;
            require(Array.isArray(children), `${value.type} needs an array`);
            children.forEach(condition);
        }
        if (value.type === 'elapsedTime') {
            for (const bound of ['min', 'max']) if (value[bound] !== undefined) require(Number.isFinite(value[bound]) && value[bound] >= 0, 'invalid time bound');
            require(value.min === undefined || value.max === undefined || value.min <= value.max, 'reversed time bounds');
        }
        if (value.type === 'not') condition(value.condition);
    }
    function effect(value) {
        require(object(value) && typeof value.script === 'string', 'effect needs a registered script');
        require(scripts.has(value.script), `unknown script ${value.script}`);
    }
    function walk(value) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(walk); return; }
        Object.entries(value).forEach(([key, child]) => {
            if (['condition', 'visibleWhen', 'takeOutCondition', 'waitUntil', 'disabledWhen', 'repeatWhen'].includes(key) && child) condition(child);
            if (key === 'noteSources') require(Array.isArray(child) && child.every(id => ids.has(id)), 'unknown note source');
            if (key === 'messages') require(Array.isArray(child) && child.length > 0 && child.every(text => typeof text === 'string' && text.trim().length), 'messages must be a nonempty array of text');
            if (key === 'effects') {
                require(Array.isArray(child), 'effects must be an array');
                child.forEach(effect);
            }
            walk(child);
        });
    }
    if (model.stateRules !== undefined) require(Array.isArray(model.stateRules) && model.stateRules.every(rule => object(rule) && object(rule.condition) && Array.isArray(rule.effects)), 'invalid state rules');
    definitions.forEach(item => {
        const npc = item.properties?.npc, config = npc?.missions;
        if (!config) return;
        require(object(config.routes) && object(config.destinations) && object(config.states), 'missions need routes, destinations and states');
        require(Boolean(model.rooms[config.home]) && typeof config.idleState === 'string', 'invalid mission home');
        for (const phase of ['outbound', 'searching', 'returning']) require(typeof config.states[phase] === 'string', 'missing mission state');
        Object.entries(config.routes).forEach(([from, edges]) => {
            require(Boolean(model.rooms[from]) && Array.isArray(edges), 'invalid mission route origin');
            edges.forEach(edge => {
                require(Boolean(model.rooms[edge.to]), 'invalid mission route destination');
                if (edge.transport) {
                    const transport = definitions.get(edge.transport)?.properties?.transport;
                    require(Boolean(transport?.stops[from] && transport.stops[edge.to]), 'mission transport edge needs two stops');
                } else require(Boolean(model.rooms[from].exits[edge.to]), 'mission route needs a physical exit');
            });
        });
        Object.values(config.destinations).forEach(destination => {
            require(Boolean(model.rooms[destination.room]) && Boolean(config.routes[destination.room]), 'unknown mission destination');
            require(Number.isInteger(destination.searchTurns) && destination.searchTurns > 0, 'invalid mission search duration');
            if (destination.departureReply !== undefined) require(Array.isArray(destination.departureReply) && destination.departureReply.length > 0 && destination.departureReply.every(text => typeof text === 'string' && text.trim()), 'invalid mission departure reply');
            if (destination.variants) require(Array.isArray(destination.variants) && destination.variants.every(variant => object(variant.condition) && Number.isInteger(variant.searchTurns) && variant.searchTurns > 0), 'invalid mission variant');
        });
        if (npc.completed) Object.entries(npc.completed).forEach(([key, value]) => require(Boolean(config.destinations[key]) && typeof value === 'boolean', 'invalid mission completion'));
        const mission = npc.mission;
        if (mission?.active) {
            require(Boolean(config.destinations[mission.destination]) && ['outbound', 'searching', 'returning'].includes(mission.phase), 'invalid active mission');
            if (mission.phase === 'searching') require(Number.isInteger(mission.remaining) && mission.remaining > 0, 'invalid search remaining');
            if (mission.ride) {
                const ride = mission.ride, transport = definitions.get(ride.edge?.transport)?.properties?.transport;
                require(['waiting', 'ready', 'boarded', 'riding'].includes(ride.stage) && Boolean(transport?.stops[ride.origin] && transport.stops[ride.edge.to]), 'invalid mission ride');
            }
        }
    });
    validateRuntime(model);
    const pending = model.player.pendingAction;
    if (pending !== undefined) require(object(pending) && pending.type === 'completeMove' && Boolean(model.rooms[pending.exitKey]) && object(pending.exitDefinition), 'invalid pending action');
    walk(model);
    return model;
}

function shouldUseSavedModel(savedModel, freshModel) {
    if (!savedModel || savedModel.version !== freshModel.version ||
        (savedModel.id || savedModel.title) !== (freshModel.id || freshModel.title)) return false;
    try {
        validateWorld(savedModel, freshModel);
        return true;
    } catch (error) {
        return false;
    }
}

// Storage failure must never interrupt a committed turn.

function commitMutation(advanceTime = true) {
    if (dispatching) {
        pendingCommit = pendingCommit === null ? advanceTime : pendingCommit || advanceTime;
        api._afterCommit?.();
    }
    if (gameModel?.player?.gameOver) {
        // An action effect may have ended play before reaching this commit.
        // Publish that final state without advancing the ended world's timers.
        updateView();
        saveGameModel();
        return;
    }
    normalizePlayerState();
    if (advanceTime) {
        const previousMinutes = gameModel.player.elapsedMinutes;
        gameModel.player.elapsedMinutes += gameModel.clock?.minutesPerTurn || 1;
        gameModel.player.turnObservations = (gameModel.clock?.notices || [])
            .filter(notice => previousMinutes < notice.minute && gameModel.player.elapsedMinutes >= notice.minute)
            .map(notice => ({ room: gameModel.player.currentRoom, text: buildConditionalText(notice.text) }));
    }
    api.events.emit('stateCheck');
    checkEndings();
    if (gameModel.player.gameOver) {
        updateView();
        saveGameModel();
        return;
    }
    if (advanceTime) {
        const roomKey = gameModel.player.currentRoom;
        const observations = gameModel.rooms[roomKey]?.observations || [];
        const before = observations.map(entry => evaluateCondition(entry.condition));
        api.schedule.advance();
        if (gameModel.player.currentRoom === roomKey) {
            gameModel.player.turnObservations.push(...observations
                .filter((entry, index) => !before[index] && evaluateCondition(entry.condition))
                .map(entry => ({ room: roomKey, text: buildConditionalText(entry.text) })));
        }
        updateTurnCues();
    }
    normalizePlayerState();
    checkEndings();
    updateView();
    saveGameModel();
}

function waitTurn() {
    if (!gameModel?.clock || !gameModel.player.started || gameModel.player.gameOver) return;
    commitMutation();
}

function formatElapsedTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function recordRoomVisit(room) {
    if (!gameModel.rooms[room]) return;
    gameModel.player.visitedRooms ||= {};
    gameModel.player.visitedRooms[room] = true;
}

function normalizePlayerState() {
    normalizePlayerCollections();

    if (!gameModel?.player) {
        return;
    }

    if (!Number.isFinite(gameModel.player.elapsedMinutes)) {
        gameModel.player.elapsedMinutes = 0;
        gameModel.player.timedRunEligible = false;
    }
    if (gameModel.player.started) recordRoomVisit(gameModel.player.currentRoom);
    if (gameModel.player.started !== true) {
        gameModel.player.started = false;
    }

    if (!gameModel.player.achievements || typeof gameModel.player.achievements !== 'object') {
        gameModel.player.achievements = {};
    }
}

function normalizePlayerCollections() {
    if (!gameModel?.player) {
        return;
    }

    const player = gameModel.player;

    if (!player.carried) {
        player.carried = {};
    }

    PLAYER_COLLECTIONS.forEach((collectionKey) => {
        if (!player[collectionKey] || typeof player[collectionKey] !== 'object') {
            player[collectionKey] = {};
        }
    });
}

function getPlayerCollection(collectionKey = 'carried') {
    normalizePlayerCollections();
    return gameModel.player[collectionKey] || {};
}

function getPlayerCarriedItems() {
    return getPlayerCollection('carried');
}

function isPlayerOwnedLocation(location) {
    return location?.owner?.type === 'player' || location?.owner?.playerOwned === true;
}

function isPlayerAccessibleLocation(location) {
    return isPlayerOwnedLocation(location) && location.accessible !== false;
}

function isDirectlyCarriedLocation(location) {
    return location?.owner?.type === 'player' && location.owner.collection === 'carried' && location.accessible !== false;
}

function hasAccessiblePlayerItem(itemKey) {
    return isDirectlyCarriedLocation(findItem(itemKey));
}

function getStandingOnItemKey() {
    if (gameModel.player.posture?.type === 'standingOn') {
        return gameModel.player.posture.item;
    }

    return null;
}

function isStandingOnItem(itemKey) {
    return getStandingOnItemKey() === itemKey;
}

function clearPlayerPosture() {
    const standingOnItemKey = getStandingOnItemKey();
    if (!standingOnItemKey) {
        return;
    }

    const item = findItemInGameModel(standingOnItemKey);
    if (item?.properties?.climbable) {
        item.properties.climbable.climbed = false;
    }

    delete gameModel.player.posture;
}

function exitRequiresStandingOn(exitDefinition, itemKey) {
    const requirements = exitDefinition?.condition?.requirements || [];
    return requirements.some((requirement) => {
        return requirement.item === itemKey && requirement.state === 'climbable.climbed';
    });
}

// Modify the movePlayer function to save the game model after movement

function movePlayer(exitKey) {
    if (gameModel.player.gameOver) {
        return;
    }

    const currentRoom = gameModel.rooms[gameModel.player.currentRoom];
    const roomName = gameModel.rooms[exitKey]?.name || exitKey;
    if (!currentRoom?.exits?.[exitKey] || !gameModel.rooms[exitKey]) return;
    const exitDefinition = normalizeExitDefinition(currentRoom.exits[exitKey], roomName);
    const standingOnItemKey = getStandingOnItemKey();

    if (!isExitVisible(exitDefinition)) {
        console.log("You can't go that way.");
        return;
    }

    if (standingOnItemKey && !exitRequiresStandingOn(exitDefinition, standingOnItemKey)) {
        const item = findItemInGameModel(standingOnItemKey);
        const message = buildConditionalText(item.properties?.climbable?.movementBlockedMessage) ||
            `You need to climb down from ${getProseItemName(item)} before moving elsewhere.`;
        displayMessageModal(message, 'Climb Down First');
        return;
    }

    const blockedMessage = getExitBlockedMessage(exitDefinition);
    if (blockedMessage) {
        displayMessageModal(blockedMessage, 'Path Blocked');
        return;
    }

    const beforeMove = exitDefinition.beforeMove;
    if (beforeMove && (!beforeMove.condition || evaluateCondition(beforeMove.condition))) {
        const message = buildConditionalText(beforeMove.message);
        if (message) {
            gameModel.player.pendingAction = { type: 'completeMove', exitKey, exitDefinition: cloneModel(exitDefinition), standingOnItemKey, reportSuccess: true, message, title: beforeMove.title || 'Before Moving' };
            displayMessageModal(message, beforeMove.title || 'Before Moving');
            return;
        }
    }

    if (exitDefinition) {
        if (exitDefinition.successMessage && exitDefinition.deferMoveUntilMessageClosed) {
            gameModel.player.pendingAction = { type: 'completeMove', exitKey, exitDefinition: cloneModel(exitDefinition), standingOnItemKey, message: exitDefinition.successMessage, title: exitDefinition.successTitle || 'Access Granted' };
            displayMessageModal(exitDefinition.successMessage, exitDefinition.successTitle || 'Access Granted');
            return;
        }

        completeMovePlayer(exitKey, exitDefinition, standingOnItemKey);
        if (exitDefinition.successMessage && !gameModel.player.gameOver) {
            displayMessageModal(exitDefinition.successMessage, exitDefinition.successTitle || 'Done');
        }
    } else {
        console.log("You can't go that way.");
    }
}

function completeMovePlayer(exitKey, exitDefinition, standingOnItemKey = null) {
    clearPlayerConnectableState();
    gameModel.player.currentRoom = exitKey;
    recordRoomVisit(exitKey);
    holdTransportForBoarding(exitKey);
    if (standingOnItemKey) {
        clearPlayerPosture();
    }
    (exitDefinition.effects || []).forEach(performEffect);
    api.events.emit('playerEnteredRoom', { room: exitKey });
    commitMutation();
}

// Function to generate and display the room description

function getRoomDescriptionText(roomKey) {
    return getRoomDescriptionParts(roomKey)
        .map((part) => part.text)
        .filter(Boolean)
        .join(' ');
}

function getRoomDescriptionParts(roomKey) {
    return [
        {
            type: 'main',
            text: descriptions.resolve(roomKey, gameModel.rooms[roomKey], false)
        }
    ].filter((part) => part.text);
}

function getRoomNoticeTexts(roomKey) {
    return [
        ...(gameModel.player.turnObservations || []).filter(entry => entry.room === roomKey).map(entry => entry.text),
        buildConditionalText(gameModel.rooms[roomKey]?.cues, true)
    ].filter(Boolean);
}

function getNpcCueTexts(roomKey) {
    const local = getRoomNoticeTexts(roomKey).join(" ");
    const transmissions = (gameModel.player.movementCues || [])
        .filter(cue => !cue.condition || evaluateCondition(cue.condition))
        .map(cue => cue.text);
    return [local, ...transmissions, ...getNearbyNpcDescriptionTexts(roomKey)].filter(Boolean);
}

function recordNpcMovementCue(itemKey, item, fromRoom, toRoom) {
    if (item.properties?.npc?.mission?.active) {
        if (fromRoom && toRoom && fromRoom !== toRoom) emitNpcReport(itemKey, item.properties.npc.missions.sounds?.[toRoom]);
        return;
    }
    const cue = item.properties?.npc?.movementCue;
    if (!cue || !fromRoom || !toRoom || fromRoom === toRoom ||
        (cue.condition && !evaluateCondition(cue.condition))) return;
    const variant = (cue.variants || []).find(entry => !entry.condition || evaluateCondition(entry.condition));
    const text = variant ? chooseVariedText(variant.texts, cue.lastText) : buildConditionalText(cue.description);
    if (variant && text) cue.lastText = text;
    if (!text) return;
    gameModel.player.movementCues ||= [];
    gameModel.player.movementCues.push({ source: itemKey, text, condition: cloneModel(cue.condition || null), fresh: true });
}

function chooseVariedText(texts, previous) {
    const available = (texts || []).filter(text => typeof text === 'string' && text.length);
    const alternatives = available.filter(text => text !== previous);
    const pool = alternatives.length ? alternatives : available;
    return pool.length ? pool[Math.floor(random() * pool.length)] : '';
}

function updateTurnCues() {
    const reports = (gameModel.player.movementCues || []).filter(cue => cue.fresh);
    const speakers = [];
    getAllRootItemCollections().forEach(items => collectItemsInCollection(items,
        item => Boolean(item.properties?.npc?.turnCue), speakers));
    if (!gameModel.player.gameOver) speakers.forEach(({ key, item }) => {
        const npc = item.properties.npc;
        const cue = npc.turnCue;
        if (npc.mission?.active) {
            npc.ambientCountdown = (npc.ambientCountdown ?? 2) - 1;
            if (npc.ambientCountdown <= 0) {
                npc.ambientCountdown = 2 + Math.floor(random() * 2);
                if (!reports.some(report => report.source === key) && (!cue.condition || evaluateCondition(cue.condition))) {
                    const texts = npc.missions.sounds?.[findItem(key).owner.key] || [];
                    const text = chooseVariedText(texts, npc.lastTurnCue);
                    if (text) { npc.lastTurnCue = text; reports.push({ source: key, text, condition: cloneModel(cue.condition || null) }); }
                }
            }
            return;
        }
        const variantIndex = (cue.variants || []).findIndex(entry => !entry.condition || evaluateCondition(entry.condition));
        const repeated = npc.lastTurnCueVariant === variantIndex;
        npc.lastTurnCueVariant = variantIndex;
        if (reports.some(report => report.source === key) ||
            (cue.condition && !evaluateCondition(cue.condition))) return;
        const variant = cue.variants?.[variantIndex];
        if (cue.intermittent && repeated) {
            npc.ambientCountdown = (npc.ambientCountdown ?? 2) - 1;
            if (npc.ambientCountdown > 0) return;
            npc.ambientCountdown = 2 + Math.floor(random() * 2);
        }
        const ambient = repeated && cue.intermittent ? npc.missions?.sounds?.[findItem(key).owner.key] : null;
        const texts = (ambient || (repeated && variant?.repeatTexts ? variant.repeatTexts : variant?.texts) || []).filter(text => typeof text === 'string' && text.length);
        if (!texts.length) return;
        const text = chooseVariedText(texts, npc.lastTurnCue);
        npc.lastTurnCue = text;
        reports.push({ source: key, text, condition: cloneModel(cue.condition || null) });
    });
    gameModel.player.movementCues = reports.map(cue => ({ ...cue, fresh: false }));
}

function getNearbyNpcDescriptionTexts(roomKey) {
    return getNearbyNpcs(roomKey)
        .map(({ item }) => buildConditionalText(item.properties?.npc?.nearbyDescription))
        .filter(Boolean);
}

function getNearbyNpcs(roomKey) {
    const adjacentRoomKeys = getAdjacentRoomKeys(roomKey);
    const nearbyNpcs = [];

    adjacentRoomKeys.forEach((adjacentRoomKey) => {
        Object.entries(gameModel.rooms?.[adjacentRoomKey]?.items || {}).forEach(([itemKey, item]) => {
            if (item.properties?.npc && !isHiddenItem(item)) {
                nearbyNpcs.push({ itemKey, item, roomKey: adjacentRoomKey });
            }
        });
    });

    return nearbyNpcs;
}

function getAdjacentRoomKeys(roomKey) {
    const adjacentRoomKeys = new Set();
    const currentRoom = gameModel.rooms?.[roomKey];

    Object.entries(currentRoom?.exits || {}).forEach(([exitKey, exitDefinition]) => {
        const normalizedExit = normalizeExitDefinition(exitDefinition, gameModel.rooms?.[exitKey]?.name || exitKey);
        if (isExitTraversableForNpcCue(normalizedExit)) {
            adjacentRoomKeys.add(exitKey);
        }
    });

    Object.entries(gameModel.rooms || {}).forEach(([candidateRoomKey, candidateRoom]) => {
        if (candidateRoomKey === roomKey) {
            return;
        }

        const reverseExit = candidateRoom.exits?.[roomKey];
        if (!reverseExit) {
            return;
        }

        const normalizedExit = normalizeExitDefinition(reverseExit, gameModel.rooms?.[roomKey]?.name || roomKey);
        if (isExitTraversableForNpcCue(normalizedExit)) {
            adjacentRoomKeys.add(candidateRoomKey);
        }
    });

    return [...adjacentRoomKeys];
}

function isExitTraversableForNpcCue(exitDefinition) {
    return isExitVisible(exitDefinition) && !getExitBlockedMessage(exitDefinition);
}

function buildConditionalText(description, separateSentences = false) {
    if (typeof description === 'string') {
        return description;
    }

    if (!Array.isArray(description)) {
        return '';
    }

    return description
        .filter((segment) => {
            if (typeof segment === 'string') {
                return true;
            }

            return evaluateCondition(segment.condition);
        })
        .map((segment) => typeof segment === 'string' ? segment : segment.text)
        .reduce((text, part) => text + (separateSentences && /[.!?][”’"]?$/.test(text) && /^(?:\*\*|\[\[)?[A-Z]/.test(part) ? ' ' : '') + part, '');
}

function parseExamineLinks(text) {
    text = String(text ?? '');
    const parts = [];
    const linkPattern = /\[\[([^\]|]+)\|([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = linkPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({
                type: 'text',
                text: text.slice(lastIndex, match.index)
            });
        }

        parts.push(match[3] !== undefined
            ? { type: 'accent', text: match[3] }
            : { type: 'examine', text: match[1], clueKey: match[2] });

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push({
            type: 'text',
            text: text.slice(lastIndex)
        });
    }

    return parts;
}

// Keep closing punctuation with an inline control, without underlining it.

function getExamineLinkTarget(clueKey, clues) {
    if (clueKey.startsWith('item:')) {
        const itemKey = clueKey.slice(5);
        const location = findItem(itemKey);
        if (location && location.accessible !== false && !isHiddenItem(location.item) && canActOnItem(itemKey, true)) {
            return { type: 'item', itemKey };
        }
        return null;
    }
    if (clues[clueKey]) {
        return {
            type: 'clue',
            clue: clues[clueKey]
        };
    }

    return null;
}

function showClueModal(clue, extraMessages = []) {
    const messageParts = [
        descriptions.clue(clue),
        ...extraMessages
    ].filter(Boolean);

    displayMessageModal(messageParts.join(' '), clue.title || 'Examine', gameModel.rooms[gameModel.player.currentRoom]?.clues || {});
}

function examineClue(clue) {
    if (!clue || gameModel.player.gameOver) return;
    if (clue) {
        clue.examined = true;
    }

    const description = descriptions.clue(clue);
    const result = runClueOnExamine(clue);
    const revealMessages = result.messages;
    commitMutation(result.ran && clue.onExamine?.consumesTurn === true);
    if (gameModel.player.gameOver) return;
    displayMessageModal([description, ...revealMessages].filter(Boolean).join(' '), clue.title || 'Examine', gameModel.rooms[gameModel.player.currentRoom]?.clues || {});
}

function runClueOnExamine(clue) {
    const onExamine = clue?.onExamine;

    if (!onExamine) {
        return { messages: [], changed: false, ran: false };
    }

    if (onExamine.once && onExamine.examined) {
        return { messages: [], changed: false, ran: false };
    }

    if (onExamine.condition && !evaluateCondition(onExamine.condition)) {
        return { messages: [], changed: false, ran: false };
    }

    const before = JSON.stringify(gameModel);
    const resultMessages = [];

    (onExamine.effects || []).forEach((effect) => {
        performEffect(effect);
        if (effect.type === 'setItemState') {
            const resultMessage = getClueEffectResultMessage(effect);
            if (resultMessage) {
                resultMessages.push(resultMessage);
            }
        }
    });

    const changed = JSON.stringify(gameModel) !== before;
    onExamine.examined = true;
    return { messages: resultMessages, changed, ran: true };
}

function getClueEffectResultMessage(effect) {
    if (typeof effect.message === 'string') {
        return effect.message;
    }

    if (effect.attribute === 'properties.hidden' && effect.value === false) {
        const revealedItem = findItemInGameModel(effect.item);
        if (revealedItem?.name) {
            return `You uncover ${getItemReferenceText(effect.item, revealedItem)}.`;
        }
    }

    return '';
}

function startGame() {
    if (!gameModel?.player || gameModel.player.gameOver) {
        return;
    }

    gameModel.player.started = true;
    recordRoomVisit(gameModel.player.currentRoom);
    commitMutation(false);
}

// Function to update the view based on the current room

function acknowledgeEndingEncounter() {
    const encounter = gameModel.player.endingEncounter;
    if (!gameModel.player.gameOver || !encounter || encounter.acknowledged) return;
    encounter.acknowledged = true;
    updateView();
    saveGameModel();
}

function getCurrentEnding() {
    if (!Array.isArray(gameModel?.endings)) {
        return null;
    }

    return gameModel.endings.find((ending) => ending.id === gameModel.player.ending) || null;
}

function awardAchievement(achievementKey) {
    normalizePlayerState();

    if (!achievementKey || !gameModel.achievements?.[achievementKey]) {
        return false;
    }

    if (gameModel.player.achievements[achievementKey]) {
        return false;
    }

    gameModel.player.achievements[achievementKey] = true;
    displayAchievementPopup(gameModel.achievements[achievementKey]);
    return true;
}

function getEarnedAchievements() {
    normalizePlayerState();

    return Object.keys(gameModel.player.achievements)
        .filter(key => gameModel.player.achievements[key] && gameModel.achievements?.[key])
        .map(key => ({ id: key, ...gameModel.achievements[key] }));
}

function getTotalAchievementCount() {
    return Object.keys(gameModel?.achievements || {}).length;
}

function getRoomImage(room) {
    const variant = (room.imageVariants || []).find(entry => !entry.condition || evaluateCondition(entry.condition));
    return { imageUrl: variant?.imageUrl || room.imageUrl, imagePosition: variant?.imagePosition || room.imagePosition };
}

function getPlayerDisplayName() {
    const posture = gameModel?.player?.posture;

    if (posture?.type === 'standingOn') {
        const item = findItemInGameModel(posture.item);
        return `You, on the ${item?.name || 'item'}`;
    }

    if (posture?.type === 'in') {
        const item = findItemInGameModel(posture.item);
        return `You, in the ${item?.name || 'item'}`;
    }

    return 'You';
}

function isItemConnectedToVisibleTarget(itemKey, item) {
    const connectedTarget = getConnectedTargetForItem(itemKey, item);

    if (!connectedTarget) {
        return false;
    }

    const currentRoom = gameModel.rooms?.[gameModel.player?.currentRoom];
    return Boolean(currentRoom?.items?.[connectedTarget.key]);
}

function normalizeExitDefinition(exitDefinition, roomName) {
    if (!exitDefinition) {
        return null;
    }

    if (typeof exitDefinition === 'string') {
        const legacyParts = deriveExitParts(exitDefinition, roomName);
        return legacyParts ?? {};
    }

    if (typeof exitDefinition === 'object' && exitDefinition.description && !exitDefinition.before && !exitDefinition.after) {
        const legacyParts = deriveExitParts(exitDefinition.description, roomName);
        if (legacyParts) {
            return { ...exitDefinition, ...legacyParts };
        }
        return { ...exitDefinition };
    }

    return exitDefinition;
}

function getActiveExitVariant(exitDefinition) {
    if (!exitDefinition || typeof exitDefinition !== 'object' || !Array.isArray(exitDefinition.variants)) {
        return null;
    }

    return exitDefinition.variants.find((variant) => evaluateCondition(variant.condition)) || null;
}

function deriveExitParts(exitText, roomName) {
    if (!exitText) {
        return null;
    }

    const underscoreMatch = exitText.match(/_(.+?)_/);
    if (underscoreMatch) {
        const linkStart = underscoreMatch.index ?? 0;
        const linkEnd = linkStart + underscoreMatch[0].length;
        return {
            before: exitText.slice(0, linkStart),
            after: exitText.slice(linkEnd)
        };
    }

    if (roomName) {
        const escapedRoom = roomName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const roomRegex = new RegExp(escapedRoom, 'i');
        const roomMatch = roomRegex.exec(exitText);
        if (roomMatch && roomMatch.index !== undefined) {
            const matchStart = roomMatch.index;
            const matchEnd = matchStart + roomMatch[0].length;
            return {
                before: exitText.slice(0, matchStart),
                after: exitText.slice(matchEnd)
            };
        }
    }

    return null;
}

function getExitDisplayDefinition(exitDefinition, roomName) {
    const normalized = normalizeExitDefinition(exitDefinition, roomName) ?? {};
    const activeVariant = getActiveExitVariant(normalized);

    if (activeVariant) {
        return {
            ...normalized,
            ...normalizeExitDefinition(activeVariant, roomName),
            condition: normalized.condition,
            variants: normalized.variants
        };
    }

    const hasCustomText = Boolean(normalized.before || normalized.after);

    if (!hasCustomText) {
        return { ...normalized, before: 'the exit to ', after: ' is open' };
    }

    return normalized;
}

function isExitVisible(exitDefinition) {
    return !exitDefinition?.visibleWhen || evaluateCondition(exitDefinition.visibleWhen);
}

function buildExitText(exitKey, exitDefinition) {
    const roomName = gameModel.rooms[exitKey]?.name || exitKey;
    const displayDefinition = getExitDisplayDefinition(exitDefinition, roomName);
    const before = displayDefinition?.before ?? '';
    const after = displayDefinition?.after ?? '';
    return `${before}${displayDefinition?.label || roomName}${after}`;
}

function getItemPropertyValue(item, propertyPath) {
    if (!item || !propertyPath) {
        return undefined;
    }

    const pathParts = propertyPath.split('.');
    return pathParts.reduce((currentValue, key) => {
        if (currentValue === undefined || currentValue === null) {
            return undefined;
        }
        return currentValue[key];
    }, item.properties);
}

function getExitBlockedMessage(exitDefinition) {
    if (!exitDefinition?.condition) {
        return null;
    }

    const condition = exitDefinition.condition;

    if (condition.type === 'requirements') {
        const requirements = Array.isArray(condition.requirements) ? condition.requirements : [];
        const unmetRequirements = requirements.filter((requirement) => {
            const item = findItemInGameModel(requirement.item);
            const currentValue = getItemPropertyValue(item, requirement.state);
            const expectedValue = Object.prototype.hasOwnProperty.call(requirement, 'value') ? requirement.value : true;
            return currentValue !== expectedValue;
        });

        if (unmetRequirements.length === 1) {
            return unmetRequirements[0].message ?? condition.message;
        }

        if (unmetRequirements.length > 1) {
            return condition.message ?? unmetRequirements[0]?.message;
        }
    }

    if (evaluateCondition(condition)) {
        return condition.message;
    }

    return null;
}

function capitalizeFirstLetter(text) {
    if (!text) {
        return text;
    }
    return text[0].toUpperCase() + text.slice(1);
}

function getContainerContentsInlineText(item, linkItems = false) {
    const container = item?.properties?.container;
    if (!container || !(container.opened || container.transparent)) {
        return '';
    }

    const contentParts = Object.entries(container.items || {})
        .filter(([, containedItem]) => !isHiddenItem(containedItem))
        .map(([containedItemKey, containedItem]) => {
            const nestedContents = getContainerContentsInlineText(containedItem, linkItems);
            return `${linkItems ? getItemReferenceText(containedItemKey, containedItem) : getItemDisplayName(containedItemKey, containedItem, { article: 'indefinite' })}${nestedContents ? ` (${containedItem.properties?.container?.supporter ? 'with' : 'containing'} ${nestedContents}${containedItem.properties?.container?.supporter ? ' on it' : ''})` : ''}`;
        });

    return formatInlineList(contentParts);
}

function getConnectedItemsInlineText(targetKey) {
    const connectedItems = getConnectedItemsForTarget(targetKey)
        .map(({ itemKey, item }) => {
            const nestedContents = getContainerContentsInlineText(item);
            return `${getItemDisplayName(itemKey, item, { article: 'indefinite' })}${nestedContents ? ` (${item.properties?.container?.supporter ? 'with' : 'containing'} ${nestedContents}${item.properties?.container?.supporter ? ' on it' : ''})` : ''}`;
        });

    return formatInlineList(connectedItems);
}

// Articles and state annotations belong to the sentence, not the object link.

function shouldListItemInRoom(item) {
    return !item.properties?.scenery && !isHiddenItem(item);
}

function isHiddenItem(item) {
    return item.properties?.hidden === true;
}

function findItem(itemKey) {
    normalizePlayerCollections();

    for (const collectionKey of PLAYER_COLLECTIONS) {
        const playerItems = gameModel.player[collectionKey] || {};
        const playerMatch = findItemInCollection(itemKey, playerItems, {
            type: 'player',
            key: 'player',
            collection: collectionKey,
            path: ['player', collectionKey],
            items: playerItems,
            accessible: true,
            playerOwned: true
        });

        if (playerMatch) {
            return playerMatch;
        }
    }

    for (const roomKey in gameModel.rooms) {
        const room = gameModel.rooms[roomKey];
        const roomItems = room.items || {};
        const roomMatch = findItemInCollection(itemKey, roomItems, {
            type: 'room',
            key: roomKey,
            path: ['rooms', roomKey, 'items'],
            items: roomItems,
            accessible: true
        });

        if (roomMatch) {
            return roomMatch;
        }
    }

    return null;
}

function isReachableItem(itemKey) {
    const location = findItem(itemKey);
    if (!location || location.accessible === false || isHiddenItem(location.item)) return false;
    return isPlayerOwnedLocation(location) || location.path[1] === gameModel.player.currentRoom;
}

function canActOnItem(itemKey, allowUnheld = false) {
    if (gameModel.player.gameOver || !isReachableItem(itemKey)) return false;
    const location = findItem(itemKey);
    return allowUnheld || !location.item.properties?.requiresHeld || isDirectlyCarriedLocation(location);
}

function findItemInCollection(itemKey, items, owner) {
    if (!items || typeof items !== 'object') {
        return null;
    }

    for (const key in items) {
        const item = items[key];

        if (key === itemKey) {
            return {
                key,
                item,
                parentItems: items,
                owner,
                path: owner.path.concat(key),
                accessible: owner.accessible !== false
            };
        }

        const containedItems = item.properties?.container?.items;
        const containerAccessible = owner.accessible !== false &&
            (item.properties?.container?.opened || item.properties?.container?.transparent);
        const containedMatch = findItemInCollection(itemKey, containedItems, {
            type: 'container',
            key,
            item,
            path: owner.path.concat(key, 'properties', 'container', 'items'),
            items: containedItems,
            accessible: Boolean(containerAccessible) && !isHiddenItem(item),
            playerOwned: owner.playerOwned === true
        });

        if (containedMatch) {
            return containedMatch;
        }
    }

    return null;
}

function findItemsInScope(scopeItems, predicate) {
    const matches = [];
    collectItemsInCollection(scopeItems, predicate, matches);
    return matches;
}

function getConnectedItemsForTarget(targetKey) {
    const connectedItems = [];

    PLAYER_COLLECTIONS.forEach((collectionKey) => {
        Object.entries(gameModel.player?.[collectionKey] || {}).forEach(([itemKey, item]) => {
            const connection = item.properties?.connectable?.targets?.[targetKey];
            if (connection?.connected) {
                connectedItems.push({ itemKey, item, collectionKey, connection });
            }
        });
    });

    return connectedItems;
}

function getConnectedTargetForItem(itemKey, item = findItemInGameModel(itemKey)) {
    const connectedTargetEntry = Object.entries(item?.properties?.connectable?.targets || {})
        .find(([, connection]) => connection.connected);

    if (!connectedTargetEntry) {
        return null;
    }

    const [targetKey, connection] = connectedTargetEntry;
    return {
        key: targetKey,
        item: findItemInGameModel(targetKey),
        connection
    };
}

function collectItemsInCollection(items, predicate, matches) {
    if (!items || typeof items !== 'object') {
        return;
    }

    Object.keys(items).forEach((itemKey) => {
        const item = items[itemKey];
        if (predicate(item, itemKey)) {
            matches.push({ key: itemKey, item });
        }

        collectItemsInCollection(item.properties?.container?.items, predicate, matches);
    });
}

function findItemInGameModel(itemKey) {
    return findItem(itemKey)?.item || null;
}

function deleteItem(itemKey) {
    const location = findItem(itemKey);
    if (!location) {
        return null;
    }

    const item = location.item;
    delete location.parentItems[itemKey];
    return item;
}

function deleteItemInGameModel(itemKey) {
    return deleteItem(itemKey);
}

function containsCollection(item, targetItems) {
    const children = item.properties?.container?.items;
    return Boolean(children && (children === targetItems ||
        Object.values(children).some((child) => containsCollection(child, targetItems))));
}

function moveItem(itemKey, targetItems) {
    const location = findItem(itemKey);
    if (!location || !targetItems || typeof targetItems !== 'object' ||
        targetItems[itemKey] || containsCollection(location.item, targetItems)) return null;
    const fromRoom = location.owner.type === 'room' ? location.owner.key : null;
    const toRoom = Object.keys(gameModel.rooms).find(key => gameModel.rooms[key].items === targetItems);
    delete location.parentItems[itemKey];
    targetItems[itemKey] = location.item;
    recordNpcMovementCue(itemKey, location.item, fromRoom, toRoom);
    api.events.emit('itemMoved', { item: itemKey, fromRoom, toRoom });
    return location.item;
}

// Function to display the item modal with action buttons

function examineItem(itemKey, isPlayerItem = false) {
    const itemLocation = findItem(itemKey);
    const item = itemLocation?.item;
    const actualIsPlayerItem = isPlayerOwnedLocation(itemLocation) || isPlayerItem;

    if (!canActOnItem(itemKey, true) || !item || (!actualIsPlayerItem && isHiddenItem(item)) || itemLocation.accessible === false) {
        return null;
    }

    let fullDescription = getItemDescription(itemKey, item);
    if (item.detail) {
        fullDescription += ' ' + item.detail;
    }

    const onExamine = item.properties?.onExamine;
    const acted = onExamine && performAction(onExamine);
    if (acted) {
        const discoveries = (onExamine.effects || [])
            .filter(effect => effect.type === 'setItemState' && effect.attribute === 'properties.hidden' && effect.value === false)
            .filter(effect => { const revealed = findItemInGameModel(effect.item); return revealed && !isHiddenItem(revealed); })
            .map(getClueEffectResultMessage).filter(Boolean);
        if (discoveries.length) fullDescription += ' ' + discoveries.join(' ');
    }

    commitMutation(Boolean(acted && onExamine.consumesTurn === true));

    return {
        item,
        description: fullDescription,
        isPlayerItem: actualIsPlayerItem
    };
}

// Reading is a deliberate action, independent of carrying the document.

function readItem(itemKey) {
    const location = findItem(itemKey);
    const readable = location?.item.properties?.readable;
    if (!readable || !canActOnItem(itemKey, true) || location.accessible === false || isHiddenItem(location.item)) return;
    const text = buildConditionalText(readable.text, true);
    if (readable.action) performAction(readable.action);
    commitMutation();
    if (!gameModel.player.gameOver) displayMessageModal(text, location.item.name, null, readable.noteSources || []);
}

function getItemDescription(itemKey, item) {
    const descriptionParts = [descriptions.resolve(itemKey, item, true)];
    const pushable = item.properties?.pushable;
    const climbable = item.properties?.climbable;
    const connectedItemsText = getConnectedItemsInlineText(itemKey);
    const connectedTarget = getConnectedTargetForItem(itemKey, item);

    if (pushable?.pushed && pushable.pushedDescription) {
        descriptionParts.push(pushable.pushedDescription);
    } else if (pushable && !pushable.pushed && pushable.unpushedDescription) {
        descriptionParts.push(pushable.unpushedDescription);
    }

    if (isStandingOnItem(itemKey) && climbable?.standingDescription) {
        descriptionParts.push(climbable.standingDescription);
    }

    if (connectedItemsText) {
        descriptionParts.push(`It is connected to ${connectedItemsText}.`);
    }

    if (connectedTarget?.item) {
        descriptionParts.push(`It is connected to ${getProseItemName(connectedTarget.item)}.`);
    }

    return descriptionParts.filter(Boolean).map(part => part.trim()).join(' ');
}

function formatInlineList(items) {
    if (items.length <= 1) {
        return items[0] || '';
    }

    if (items.length === 2) {
        return `${items[0]} and ${items[1]}`;
    }

    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function getVisibleContainerContentsMessage(container) {
    const containerItem = {
        properties: {
            container: {
                ...container,
                opened: true
            }
        }
    };
    const visibleContents = getContainerContentsInlineText(containerItem, true);

    if (!visibleContents) {
        return '';
    }

    return `Inside, you can see ${visibleContents}.`;
}

function getContainerOpenMessage(containerKey, item) {
    const container = item?.properties?.container;
    const messageParts = [
        container?.openMessage || `You open ${getProseItemName(item)}.`,
        getVisibleContainerContentsMessage(container)
    ];

    return messageParts.filter(Boolean).join(' ');
}

function getItemReferenceText(itemKey, item) {
    const base = formatItemBaseName(item.name, 'indefinite', item.article);
    const article = item.article === 'none' ? '' : (base.match(/^(?:a|an|the) /)?.[0] || '');
    const annotation = getItemDisplayName(itemKey, item, { article: 'indefinite' }).slice(base.length);
    return `${article}[[${base.slice(article.length)}|item:${itemKey}]]${annotation}`;
}

function getItemDisplayName(itemKey, item, options = {}) {
    const labels = [];
    const pushable = item.properties?.pushable;
    const baseName = formatItemBaseName(item.name, options.article, item.article);

    if (pushable?.pushed && pushable.pushedLabel) {
        labels.push(pushable.pushedLabel);
    } else if (pushable && !pushable.pushed && pushable.unpushedLabel) {
        labels.push(pushable.unpushedLabel);
    }

    if (labels.length === 0) {
        return baseName;
    }

    return `${baseName} (${labels.join(', ')})`;
}

function getProseItemName(item) {
    return formatItemBaseName(item?.name || 'item', 'definite', item?.article === 'the' ? 'the' : null);
}

function formatItemBaseName(name, requestedArticle = 'none', authoredArticle = null) {
    if (!name || requestedArticle === 'none') {
        return name;
    }

    const displayName = shouldLowercaseArticleName(name, authoredArticle)
        ? name.replace(/[A-Za-z]+/g, word => /^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase())
        : name;

    if (authoredArticle === 'none') {
        return displayName;
    }

    if (authoredArticle === 'the') {
        return `the ${displayName}`;
    }

    if (authoredArticle === 'a' || authoredArticle === 'an') {
        return `${authoredArticle} ${displayName}`;
    }

    if (requestedArticle === 'definite') {
        return `the ${displayName}`;
    }

    if (requestedArticle === 'indefinite') {
        return `${getIndefiniteArticle(displayName)} ${displayName}`;
    }

    return name;
}

function shouldLowercaseArticleName(name, authoredArticle) {
    if (authoredArticle === 'the') {
        return false;
    }

    return /^[A-Z][a-z]/.test(name);
}

function getIndefiniteArticle(text) {
    const firstWord = String(text || '').trim().split(/\s+/)[0] || '';
    return /^[aeiou]/i.test(firstWord) ? 'an' : 'a';
}

function getAvailableActions(itemKey) {
    const itemLocation = findItem(itemKey);
    const item = itemLocation?.item;

    if (!canActOnItem(itemKey, true) || !item || (!isPlayerOwnedLocation(itemLocation) && isHiddenItem(item)) || itemLocation.accessible === false) {
        return [];
    }

    const isPlayerOwned = isPlayerOwnedLocation(itemLocation);
    const playerCollection = itemLocation.owner.collection;
    const isCarried = playerCollection === 'carried';
    const isWorn = playerCollection === 'worn';
    const isNestedInContainer = itemLocation.owner.type === 'container';
    const properties = item.properties || {};
    const actions = [];
    const connectedTarget = getConnectedTargetForItem(itemKey, item);

    if (connectedTarget) {
        return getDisconnectionTargets(itemKey).map((target) => ({
            id: `disconnect:${target.key}`,
            label: target.connection.disconnectLabel || `Disconnect from ${target.item.name}`
        }));
    }

    if (properties.portable && !properties.fixed && !isPlayerOwned && !isNestedInContainer) {
        actions.push({ id: 'take', label: 'Take' });
    }

    if (isNestedInContainer && properties.portable && !properties.fixed && (!properties.takeOutCondition || evaluateCondition(properties.takeOutCondition))) {
        const holder = findItemInGameModel(itemLocation.owner.key)?.properties?.container;
        actions.push({ id: 'take out', label: holder?.takeLabel || (holder?.supporter ? 'Take' : 'Take Out') });
    }

    if (properties.readable) actions.push({ id: 'read', label: 'Read' });

    if (isWorn) actions.push({ id: 'remove', label: 'Remove' });
    if (!canActOnItem(itemKey)) return actions;

    if (isCarried && properties.wearable && !isWorn) {
        actions.push({ id: 'wear', label: 'Wear' });
    }


    const passageExit = gameModel.rooms[gameModel.player.currentRoom]?.exits?.[properties.passage?.destination];
    if (passageExit && isExitVisible(passageExit)) {
        actions.push({ id: 'enter', label: properties.passage.label || 'Enter' });
    }

    if (properties.edible && isPlayerOwned) {
        actions.push({ id: 'eat', label: 'Eat' });
    }

    if (!isPlayerOwned && properties.searchable && canSearchItem(itemKey)) {
        actions.push({ id: 'search', label: 'Search' });
    }

    if (isCarried && !isWorn && properties.droppable !== false) {
        actions.push({ id: 'drop', label: 'Drop' });
    }

    if (properties.container) {
        const container = properties.container;
        const hasKey = !container.key || hasAccessiblePlayerItem(container.key);

        if (container.lockable && container.locked && !container.key) {
            actions.push({ id: 'unlock', label: 'Unlock' });
        } else {
            if (container.openable) {
                actions.push({
                    id: container.opened ? 'close' : 'open',
                    label: container.opened ? 'Close' : 'Open'
                });
            }
            if (container.lockable && !container.locked && !container.opened && hasKey) {
                actions.push({ id: 'lock', label: 'Lock' });
            }
        }
    }

    if (properties.door) {
        const door = properties.door;
        const hasKey = !door.key || hasAccessiblePlayerItem(door.key);

        if (door.lockable && door.locked && !door.key) {
            actions.push({ id: 'unlock', label: 'Unlock' });
        } else {
            if (door.openable && !door.locked) {
                actions.push({
                    id: door.opened ? 'close' : 'open',
                    label: door.opened ? 'Close' : 'Open'
                });
            }
            if (door.lockable && !door.locked && !door.opened && hasKey) {
                actions.push({ id: 'lock', label: 'Lock' });
            }
        }
    }

    if (properties.turnable) {
        actions.push({
            id: properties.turnedOn ? 'turn off' : 'turn on',
            label: properties.turnedOn ? 'Turn Off' : 'Turn On'
        });
    }

    if (!isPlayerOwned && properties.pressable) {
        actions.push({ id: 'press', label: properties.pressable.label || 'Press' });
    }

    getRecordOptions(itemKey).forEach((record, index) => {
        if (record.onExamine !== false && canRecordNote(itemKey, index)) {
            actions.push({ id: index === 0 ? 'record' : `record:${index}`, label: getRecordButtonLabel(record) });
        }
    });
    if (typeof properties.textValue === 'string') {
        getRecordedTextActions(itemKey).forEach(({ targetKey, label }) => {
            actions.push({ id: `enterText:${targetKey}`, label });
        });
    }

    if (properties.input && !properties.input.notesOnly && (!properties.input.condition || evaluateCondition(properties.input.condition))) {
        actions.push({ id: 'input', label: properties.input.label || 'Enter Input' });
    }

    (properties.choices || []).forEach((choice, index) => {
        if (!choice.condition || evaluateCondition(choice.condition)) {
            actions.push({
                id: `choice:${index}`,
                label: choice.label || 'Choose'
            });
        }
    });

    if (isPlayerOwned) {
        getKeyTargets(itemKey).forEach((target) => {
            actions.push({ id: `unlock:${target.key}`, label: `Unlock ${target.item.name}` });
        });
        const insertionTargets = getInsertionTargets(itemKey);
        getPutTargets(itemKey).forEach((target) => {
            actions.push({
                id: `put:${target.key}`,
                label: `Put ${target.item.properties.container.supporter ? 'on' : 'in'} ${target.item.name}`
            });
        });

        insertionTargets.forEach((target) => {
            actions.push({
                id: `insert:${target.key}`,
                label: `${target.item.properties.container.insertable[itemKey].label || 'Insert into'} ${target.item.name}`
            });
        });

        getConnectionTargets(itemKey).forEach((target) => {
            actions.push({
                id: `connect:${target.key}`,
                label: target.connection.label || `Connect to ${target.item.name}`
            });
        });

        getDisconnectionTargets(itemKey).forEach((target) => {
            actions.push({
                id: `disconnect:${target.key}`,
                label: target.connection.disconnectLabel || `Disconnect from ${target.item.name}`
            });
        });

        getToolActions(itemKey).forEach((toolAction, index) => {
            actions.push({
                id: `toolAction:${index}`,
                label: toolAction.label
            });
        });
    }

    if (!isPlayerOwned &&
        properties.pushable &&
        !properties.pushable.pushed &&
        !isStandingOnItem(itemKey) &&
        (!properties.pushable.condition || evaluateCondition(properties.pushable.condition))) {
        actions.push({ id: 'push', label: 'Push' });
    }

    if (!isPlayerOwned && properties.pushable?.pushed && properties.pullable && !isStandingOnItem(itemKey)) {
        actions.push({ id: 'pull', label: properties.pullable.label || 'Pull' });
    }

    if (!isPlayerOwned && properties.climbable && !isStandingOnItem(itemKey)) {
        actions.push({ id: 'climb', label: 'Climb' });
    }

    if (!isPlayerOwned && properties.climbable && isStandingOnItem(itemKey)) {
        actions.push({ id: 'climb down', label: 'Climb Down' });
    }

    return actions;
}

function getPutTargets(itemKey) {
    const targets = [];
    if (!canActOnItem(itemKey)) return targets;
    const itemLocation = findItem(itemKey);
    const item = itemLocation?.item;

    if (!isPlayerAccessibleLocation(itemLocation) || itemLocation.owner.collection !== 'carried' || !item?.properties?.portable) {
        return targets;
    }

    const currentRoom = gameModel.rooms[gameModel.player.currentRoom];
    collectPutTargets(itemKey, currentRoom.items, true, targets);
    PLAYER_COLLECTIONS.forEach((collectionKey) => {
        collectPutTargets(itemKey, gameModel.player[collectionKey], true, targets);
    });

    return targets;
}

// Helper function to add action buttons to the modal

function handleItemAction(...args) { return actions.handleItemAction(...args); }

function chooseItemAction(...args) { return actions.chooseItemAction(...args); }

function enterItemInput(...args) { return actions.enterItemInput(...args); }

function submitTextInput(...args) { return actions.submitTextInput(...args); }

function getTextInputTargets(noteKey) {
    const note = findItem(noteKey);
    if (!isPlayerOwnedLocation(note) || note.accessible === false || !canActOnItem(noteKey) || typeof note.item.properties?.textValue !== 'string') return [];
    if (note.owner.type === 'container' && !canActOnItem(note.owner.key)) return [];
    const targets = [];
    collectItemsInCollection(gameModel.rooms[gameModel.player.currentRoom].items,
        item => Boolean(item.properties?.input), targets);
    const allowedTargets = note.item.properties.textInputTargets;
    return targets.filter(({key, item}) => (!allowedTargets || allowedTargets.includes(key)) && canActOnItem(key) && !isHiddenItem(item) && findItem(key)?.accessible !== false &&
        (!item.properties.input.condition || evaluateCondition(item.properties.input.condition)));
}

function getRecordedTextActions(noteKey) {
    const prefix = findItem(noteKey)?.item.properties?.textInputLabel || 'Enter into';
    return getTextInputTargets(noteKey).map(({ key, item }) => ({ noteKey, targetKey: key, label: `${prefix} ${item.name}` }));
}

function enterRecordedText(...args) { return actions.enterRecordedText(...args); }

function getRecordOptions(sourceKey) {
    const record = findItem(sourceKey)?.item.properties?.recordable;
    return record ? (Array.isArray(record) ? record : [record]) : [];
}

function canRecordNote(sourceKey, index = 0) {
    const source = findItem(sourceKey);
    const record = getRecordOptions(sourceKey)[index];
    if (!record || !canActOnItem(sourceKey) || source.accessible === false || isHiddenItem(source.item)) return false;
    const notebook = findItem(record.container);
    return Boolean(notebook && isPlayerOwnedLocation(notebook) && canActOnItem(record.container) && notebook.accessible !== false && notebook.item.properties?.container?.opened &&
        gameModel.items?.[record.entry] && !findItem(record.entry) && (!record.condition || evaluateCondition(record.condition)));
}

function getRecordButtonLabel(record, fallback = '') {
    if (record.buttonLabel) return record.buttonLabel;
    const suffix = record.label || fallback;
    return suffix ? `Make a note: ${suffix}` : 'Make a note';
}

function getMessageNoteActions(sourceKeys = []) {
    return sourceKeys.flatMap(sourceKey => getRecordOptions(sourceKey).flatMap((record, index) => {
        if (!canRecordNote(sourceKey, index)) return [];
        const fallback = sourceKeys.length > 1 ? findItemInGameModel(sourceKey).name : '';
        return [{ sourceKey, index, label: getRecordButtonLabel(record, fallback) }];
    }));
}

function recordNote(...args) { return actions.recordNote(...args); }

function inputValueMatches(...args) { return actions.inputValueMatches(...args); }

function chooseToolAction(...args) { return actions.chooseToolAction(...args); }

function eatItem(...args) { return actions.eatItem(...args); }

function dropItem(...args) { return actions.dropItem(...args); }

function pickUpItem(...args) { return actions.pickUpItem(...args); }

function movePlayerItemToCollection(...args) { return actions.movePlayerItemToCollection(...args); }

function takeOutItem(...args) { return actions.takeOutItem(...args); }

function putItemInContainer(...args) { return actions.putItemInContainer(...args); }

function performContainerPutAction(...args) { return actions.performContainerPutAction(...args); }

function wearItem(...args) { return actions.wearItem(...args); }

function removeWornItem(...args) { return actions.removeWornItem(...args); }

function canSearchItem(itemKey) {
    const item = findItemInGameModel(itemKey);
    const searchable = item?.properties?.searchable;

    if (!searchable) {
        return false;
    }

    return !(searchable.once && searchable.searched);
}

function searchItem(...args) { return actions.searchItem(...args); }

function unlockContainer(...args) { return actions.unlockContainer(...args); }

function lockContainer(...args) { return actions.lockContainer(...args); }

function openContainer(...args) { return actions.openContainer(...args); }

function closeContainer(...args) { return actions.closeContainer(...args); }

function unlockDoor(...args) { return actions.unlockDoor(...args); }

function lockDoor(...args) { return actions.lockDoor(...args); }

function openDoor(...args) { return actions.openDoor(...args); }

function closeDoor(...args) { return actions.closeDoor(...args); }

function turnOnItem(...args) { return actions.turnOnItem(...args); }

function turnOffItem(...args) { return actions.turnOffItem(...args); }

function handleInsertion(...args) { return actions.handleInsertion(...args); }

function moveItemToContainer(...args) { return actions.moveItemToContainer(...args); }

function getKeyTargets(keyItemKey) {
    if (!canActOnItem(keyItemKey) || !isDirectlyCarriedLocation(findItem(keyItemKey))) return [];
    const matches = [];
    const matchesLock = (item, itemKey) => {
        return [item.properties?.container, item.properties?.door].some((lock) =>
            lock?.lockable && lock.locked && lock.key === keyItemKey) && canActOnItem(itemKey);
    };
    for (const collection of getAllRootItemCollections()) {
        collectItemsInCollection(collection, matchesLock, matches);
    }
    return matches;
}

function getInsertionTargets(itemKey) {
    const targets = [];
    if (!canActOnItem(itemKey)) return targets;
    const itemLocation = findItem(itemKey);

    if (!isDirectlyCarriedLocation(itemLocation)) {
        return targets;
    }

    const currentRoom = gameModel.rooms[gameModel.player.currentRoom];

    collectInsertionTargets(itemKey, currentRoom.items, true, targets);
    for (const collectionKey of PLAYER_COLLECTIONS) {
        collectInsertionTargets(itemKey, gameModel.player[collectionKey], true, targets);
    }

    return targets;
}

function getConnectionTargets(itemKey) {
    const targets = [];
    if (!canActOnItem(itemKey)) return targets;
    const itemLocation = findItem(itemKey);
    const item = itemLocation?.item;
    const connectable = item?.properties?.connectable;

    if (!isDirectlyCarriedLocation(itemLocation) || !connectable?.targets) {
        return targets;
    }

    const currentRoom = gameModel.rooms[gameModel.player.currentRoom];
    Object.entries(connectable.targets).forEach(([targetKey, connection]) => {
        if (connection.connected || connection.disconnected === true) {
            return;
        }

        const targetItem = currentRoom?.items?.[targetKey];
        if (!targetItem || !canActOnItem(targetKey)) {
            return;
        }

        if (connection.condition && !evaluateCondition(connection.condition)) {
            return;
        }

        targets.push({ key: targetKey, item: targetItem, connection });
    });

    return targets;
}

function getDisconnectionTargets(itemKey) {
    const targets = [];
    if (!canActOnItem(itemKey)) return targets;
    const itemLocation = findItem(itemKey);
    const item = itemLocation?.item;
    const connectable = item?.properties?.connectable;

    if (!isDirectlyCarriedLocation(itemLocation) || !connectable?.targets) {
        return targets;
    }

    const currentRoom = gameModel.rooms[gameModel.player.currentRoom];
    Object.entries(connectable.targets).forEach(([targetKey, connection]) => {
        if (!connection.connected) {
            return;
        }

        const targetItem = currentRoom?.items?.[targetKey];
        if (!targetItem || !canActOnItem(targetKey)) {
            return;
        }

        targets.push({ key: targetKey, item: targetItem, connection });
    });

    return targets;
}

function connectItem(...args) { return actions.connectItem(...args); }

function disconnectItem(...args) { return actions.disconnectItem(...args); }

function disconnectOtherTargets(...args) { return actions.disconnectOtherTargets(...args); }

function clearPlayerConnectableState(...args) { return actions.clearPlayerConnectableState(...args); }

function clearConnectableStateInItems(...args) { return actions.clearConnectableStateInItems(...args); }

function getToolActions(toolKey) {
    if (!canActOnItem(toolKey)) return [];
    const toolLocation = findItem(toolKey);
    const tool = toolLocation?.item;
    const toolDefinition = tool?.properties?.tool;
    const actions = [];

    if (!isDirectlyCarriedLocation(toolLocation) || !toolDefinition) {
        return actions;
    }

    const currentRoom = gameModel.rooms[gameModel.player.currentRoom];
    collectToolActions(toolKey, toolDefinition, currentRoom.items, true, actions);
    return actions;
}

function collectToolActions(toolKey, toolDefinition, items, isAccessible, actions) {
    if (!items || typeof items !== 'object' || !isAccessible) {
        return;
    }

    Object.entries(items).forEach(([targetKey, targetItem]) => {
        const targetLocation = findItem(targetKey);
        const cuttable = targetItem.properties?.cuttable;

        if (canActOnItem(targetKey) && toolCanUseCuttable(toolKey, toolDefinition, cuttable)) {
            (cuttable.actions || []).forEach((cutAction) => {
                if (!cutAction.condition || evaluateCondition(cutAction.condition)) {
                    actions.push({
                        label: cutAction.label || `Cut ${targetItem.name}`,
                        target: targetKey,
                        action: cutAction.action || {}
                    });
                }
            });
        }

        const container = targetItem.properties?.container;
        const contentsAccessible = targetLocation?.accessible !== false &&
            Boolean(container && (container.opened || container.transparent));
        collectToolActions(toolKey, toolDefinition, container?.items, contentsAccessible, actions);
    });
}

function toolCanUseCuttable(toolKey, toolDefinition, cuttable) {
    if (!cuttable) {
        return false;
    }

    if (cuttable.tool && cuttable.tool !== toolKey) {
        return false;
    }

    if (cuttable.capability) {
        return (toolDefinition.capabilities || []).includes(cuttable.capability);
    }

    return true;
}

function collectInsertionTargets(itemKey, items, isAccessible, targets) {
    if (!items || typeof items !== 'object' || !isAccessible) {
        return;
    }

    for (const key in items) {
        if (key === itemKey) {
            continue;
        }

        const item = items[key];
        if (isHiddenItem(item)) {
            continue;
        }

        const container = item.properties?.container;

        const insertion = container?.insertable?.[itemKey];
        if (canActOnItem(key) && insertion && (!insertion.action?.condition || evaluateCondition(insertion.action.condition))) {
            targets.push({ key, item });
        }

        const contentsAccessible = Boolean(container && (container.opened || container.transparent));
        collectInsertionTargets(itemKey, container?.items, contentsAccessible, targets);
    }
}

function collectPutTargets(itemKey, items, isAccessible, targets) {
    if (!items || typeof items !== 'object' || !isAccessible) {
        return;
    }

    const itemLocation = findItem(itemKey);

    for (const key in items) {
        if (key === itemKey) {
            continue;
        }

        const item = items[key];
        if (isHiddenItem(item)) {
            continue;
        }

        const container = item.properties?.container;
        const targetLocation = findItem(key);

        if (canActOnItem(key) && container?.opened &&
            !container.insertable?.[itemKey] &&
            containerAcceptsItem(container, itemKey) &&
            itemLocation?.owner?.key !== key &&
            !isPathPrefix(itemLocation?.path, targetLocation?.path)) {
            targets.push({ key, item });
        }

        const contentsAccessible = Boolean(container && (container.opened || container.transparent));
        collectPutTargets(itemKey, container?.items, contentsAccessible, targets);
    }
}

function containerAcceptsItem(container, itemKey) {
    if (!Object.prototype.hasOwnProperty.call(container, 'accepts')) {
        return true;
    }

    if (!Array.isArray(container.accepts)) {
        return false;
    }

    return container.accepts.includes('*') || container.accepts.includes(itemKey);
}

function isPathPrefix(parentPath, childPath) {
    if (!Array.isArray(parentPath) || !Array.isArray(childPath) || parentPath.length >= childPath.length) {
        return false;
    }

    return parentPath.every((pathPart, index) => childPath[index] === pathPart);
}

function selectConditionalAction(...args) { return actions.selectConditionalAction(...args); }

function performAction(...args) { return actions.performAction(...args); }

function performEffect(effect) {
    if (!effect) return;
    const script = scripts.get(effect.script);
    if (!script) throw new Error(`Unknown game script: ${effect.script}`);
    script(api.context());
}

function getItemChoiceOptions(itemKey, choiceIndex) {
    const choice = findItemInGameModel(itemKey)?.properties?.choices?.[choiceIndex];
    if (!canActOnItem(itemKey) || !choice || (choice.condition && !evaluateCondition(choice.condition))) return [];
    return (choice.options || []).map((option, index) => ({ ...option, index,
        disabled: Boolean(option.disabledWhen && evaluateCondition(option.disabledWhen))
    })).filter(option => !option.condition || evaluateCondition(option.condition));
}

function chooseItemOption(...args) { return actions.chooseItemOption(...args); }

function getAllRootItemCollections() {
    const collections = Object.values(gameModel.rooms || {}).map((room) => room.items);
    PLAYER_COLLECTIONS.forEach((collectionKey) => collections.push(gameModel.player?.[collectionKey]));
    return collections;
}

function collectTimersInItems(collections, timers) {
    collections.forEach((items) => {
        if (!items || typeof items !== 'object') {
            return;
        }

        Object.values(items).forEach((item) => {
            if (item.properties?.timer) {
                timers.push({ item });
            }
            collectTimersInItems([item.properties?.container?.items], timers);
        });
    });
}

function revealItem(itemKey) {
    const item = findItemInGameModel(itemKey);
    if (item?.properties) {
        item.properties.hidden = false;
    }
}

function canPlaceItemTree(itemKey, item, replacedItem = null) {
    const seen = new Set();
    function visit(key, candidate) {
        if (seen.has(key)) return false;
        seen.add(key);
        const existing = findItem(key);
        if (existing && existing.item !== replacedItem &&
            !(replacedItem && containsCollection(replacedItem, existing.parentItems))) return false;
        return Object.entries(candidate.properties?.container?.items || {}).every(([id, child]) => visit(id, child));
    }
    return visit(itemKey, item);
}

function setItemIdByEffect(effect) {
    const location = findItem(effect.item);
    const sourceItem = gameModel.items?.[effect.to] || location?.item;

    if (!location || !sourceItem || !effect.to || findItem(effect.to) || !canPlaceItemTree(effect.to, sourceItem, location.item)) {
        return;
    }

    delete location.parentItems[effect.item];
    location.parentItems[effect.to] = cloneModel(sourceItem);
}

function createItemByEffect(effect) {
    const sourceItem = gameModel.items?.[effect.item];
    const targetItems = getTargetItems(effect.to);

    if (!sourceItem || !targetItems || !canPlaceItemTree(effect.item, sourceItem)) {
        return;
    }

    targetItems[effect.item] = cloneModel(sourceItem);
}

function moveItemByEffect(effect) {
    const targetItems = getTargetItems(effect.to);
    if (targetItems) {
        moveItem(effect.item, targetItems);
    }
}

function getTargetItems(target = {}) {
    if (target.type === 'carried') {
        return getPlayerCarriedItems();
    }

    if (target.type === 'worn') {
        return getPlayerCollection(target.type);
    }

    if (target.type === 'room') {
        const room = gameModel.rooms[target.room || gameModel.player.currentRoom];
        if (!room) return null;
        if (!room.items) {
            room.items = {};
        }
        return room.items;
    }

    if (target.type === 'container') {
        const container = findItemInGameModel(target.item);
        if (!container?.properties?.container) {
            return null;
        }
        if (!container.properties.container.items) {
            container.properties.container.items = {};
        }
        return container.properties.container.items;
    }

    return null;
}

function createExit(effect) {
    const room = gameModel.rooms[effect.from || gameModel.player.currentRoom];
    if (!room) {
        return;
    }

    if (!room.exits) {
        room.exits = {};
    }

    const targetRoomName = gameModel.rooms[effect.target]?.name || effect.target;
    const exitDefinition = normalizeExitDefinition(effect, targetRoomName);
    room.exits[effect.target] = {
        before: exitDefinition.before,
        after: exitDefinition.after
    };
}

function movePlayerByEffect(effect) {
    if (!gameModel.rooms[effect.room]) {
        return;
    }

    clearPlayerPosture();
    clearPlayerConnectableState();
    gameModel.player.currentRoom = effect.room;
    recordRoomVisit(effect.room);
}

function performUpdateAction(updateAction) {
    const targetItem = findItemInGameModel(updateAction.item);
    if (!targetItem || !updateAction.attribute) {
        return;
    }

    const attributePath = updateAction.attribute.split('.');
    if (attributePath.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) return;
    let attributeReference = targetItem;

    // Traverse the path to the attribute
    for (let i = 0; i < attributePath.length - 1; i++) {
        if (!attributeReference || typeof attributeReference !== 'object' || attributeReference[attributePath[i]] === undefined) {
            return;
        }
        attributeReference = attributeReference[attributePath[i]];
    }

    // Update the attribute value
    const attributeName = attributePath[attributePath.length - 1];
    if (attributeReference && typeof attributeReference === 'object') attributeReference[attributeName] = updateAction.newValue;
}

function evaluateCondition(condition) {
    if (!condition) {
        return true;
    }

    if (condition.predicate) {
        const predicate = scripts.get(condition.predicate);
        if (!predicate) throw new Error(`Unknown predicate: ${condition.predicate}`);
        return predicate(api.context());
    }

    if (condition.type === 'ownsItem') {
        return Boolean(isPlayerOwnedLocation(findItem(condition.item))) === (condition.value ?? true);
    }

    if (condition.type === 'hasItem') {
        const itemLocation = findItem(condition.item);
        return Boolean(isDirectlyCarriedLocation(itemLocation)) === (condition.value ?? true);
    }

    if (condition.type === 'itemInContainer') {
        const itemLocation = findItem(condition.item);
        return Boolean(itemLocation?.owner?.type === 'container' && itemLocation.owner.key === condition.container) === (condition.value ?? true);
    }

    if (condition.type === 'itemInRoom') {
        const itemLocation = findItem(condition.item);
        return Boolean(itemLocation?.owner?.type === 'room' && itemLocation.owner.key === condition.room) === (condition.value ?? true);
    }

    if (condition.type === 'itemConnected') {
        const item = findItemInGameModel(condition.item);
        const isConnected = Boolean(item?.properties?.connectable?.targets?.[condition.target]?.connected);
        return isConnected === (condition.value ?? true);
    }

    if (condition.type === 'itemExists') {
        return Boolean(findItem(condition.item)) === (condition.value ?? true);
    }

    if (condition.type === 'currentRoom') {
        return gameModel.player.currentRoom === condition.room;
    }

    if (condition.type === 'roomVisited') {
        return Boolean(gameModel.player.visitedRooms?.[condition.room]) === (condition.value ?? true);
    }

    if (condition.type === 'clueExamined') {
        const clue = getRoomClue(condition.room, condition.clue);
        return Boolean(clue?.examined || clue?.onExamine?.examined) === (condition.value ?? true);
    }

    if (condition.type === 'elapsedTime') {
        const minutes = gameModel.player.elapsedMinutes;
        return gameModel.player.timedRunEligible !== false && Number.isFinite(minutes) &&
            (condition.min === undefined || minutes >= condition.min) &&
            (condition.max === undefined || minutes <= condition.max);
    }

    if (condition.type === 'itemState' || !condition.type) {
        const item = findItemInGameModel(condition.item);
        const stateValue = getItemPropertyValue(item, condition.state);
        const expectedValue = Object.prototype.hasOwnProperty.call(condition, 'value') ? condition.value : true;
        return stateValue === expectedValue;
    }

    if (condition.type === 'all') {
        return (condition.conditions || []).every(evaluateCondition);
    }

    if (condition.type === 'any') {
        return (condition.conditions || []).some(evaluateCondition);
    }

    if (condition.type === 'not') {
        return !evaluateCondition(condition.condition);
    }

    return false;
}

function getRoomClue(roomKey, clueKey) {
    return gameModel.rooms?.[roomKey]?.clues?.[clueKey] || null;
}

function checkEndings() { api.events.emit('checkEndings'); }

function endGame(ending) {
    (ending.effects || []).forEach(performEffect);
    gameModel.player.gameOver = true;
    gameModel.player.ending = ending.id || null;
    const encounterDescription = buildConditionalText(ending.encounter?.description, true);
    const observations = (gameModel.player.turnObservations || [])
        .filter(entry => entry.room === gameModel.player.currentRoom).map(entry => entry.text);
    const encounterText = encounterDescription ? [...observations, encounterDescription].join('\n\n') : '';
    if (encounterText) gameModel.player.endingEncounter = { text: encounterText, acknowledged: false };
    else delete gameModel.player.endingEncounter;
}

function pushItem(...args) { return actions.pushItem(...args); }

function pullItem(...args) { return actions.pullItem(...args); }

function climbItem(...args) { return actions.climbItem(...args); }

function climbDownFromItem(...args) { return actions.climbDownFromItem(...args); }

function pressItem(...args) { return actions.pressItem(...args); }

function getMissionRoute(...args) { return worldEvents.getMissionRoute(...args); }
function emitNpcReport(...args) { return worldEvents.emitNpcReport(...args); }
function startMission(...args) { return worldEvents.startMission(...args); }
function finishMission(...args) { return worldEvents.finishMission(...args); }
function advanceMissionTransport(...args) { return worldEvents.advanceMissionTransport(...args); }
function advanceMissions(...args) { return worldEvents.advanceMissions(...args); }
function requestTransport(...args) { return worldEvents.requestTransport(...args); }
function recordTransportNotice(...args) { return worldEvents.recordTransportNotice(...args); }
function holdTransportForBoarding(...args) { return worldEvents.holdTransportForBoarding(...args); }
function advanceTransports(...args) { return worldEvents.advanceTransports(...args); }
function startTimer(...args) { return worldEvents.startTimer(...args); }
function advanceTimers(...args) { return worldEvents.advanceTimers(...args); }

const api = {
    output, displayMessageModal, showItemChoiceOptions,
    get state() { return gameModel; },
    world: cloneModel(world), messages: [],
    setHooks(value) { hooks = { ...hooks, ...value }; },
    registerScript(id, handler) { if (typeof id !== 'string' || !id.trim() || typeof handler !== 'function' || handler.constructor.name === 'AsyncFunction') throw new TypeError('Scripts require an ID and synchronous handler'); if (scripts.has(id)) throw new Error(`Duplicate script: ${id}`); scripts.set(id, handler); },
    save() { const saved = cloneModel(gameModel); saved.runtime = { randomSeed: options.seed ?? 123456789, ...saved.runtime, saveFormatVersion: 1, worldSchemaVersion: 1 }; return saved; },
    load(saved) { const next = cloneModel(saved);
        if ((next.id || next.title) !== (world.id || world.title)) throw new Error('Save belongs to a different game');
        validateWorld(next, api.initialState || world); gameModel = next; normalizePlayerState(); return api; },
    context(action = {}) { return {
        action, actor: action.actor || 'player', target: findItemInGameModel(action.target) || gameModel.rooms[action.target],
        secondaryTarget: findItemInGameModel(action.secondaryTarget), room: gameModel.rooms[gameModel.player.currentRoom],
        world: api.world, state: gameModel, game: api,
        say: displayMessageModal,
        commit: (advanceTime = true) => commitMutation(advanceTime),
        set: (item, attribute, value) => performUpdateAction({ item, attribute, newValue: cloneModel(value) }),
        move: (item, to) => moveItemByEffect({ item, to }),
        emit: (name, data) => api.events.emit(name, data)
    }; },
    _begin() { dispatching = true; pendingCommit = null; },
    _successful() { return pendingCommit !== null; },
    _finish() { dispatching = false; pendingCommit = null; },
    _cancel() { dispatching = false; pendingCommit = null; },
    acknowledgeMessage() {
        const pending = gameModel.player.pendingAction;
        if (!pending) return;
        delete gameModel.player.pendingAction;
        completeMovePlayer(pending.exitKey, pending.exitDefinition, pending.standingOnItemKey);
        if (pending.reportSuccess && pending.exitDefinition.successMessage && !gameModel.player.gameOver)
            displayMessageModal(pending.exitDefinition.successMessage, pending.exitDefinition.successTitle || 'Done');
    },
    cloneModel,
    validateWorld,
    shouldUseSavedModel,
    commitMutation,
    waitTurn,
    formatElapsedTime,
    recordRoomVisit,
    normalizePlayerState,
    normalizePlayerCollections,
    getPlayerCollection,
    getPlayerCarriedItems,
    isPlayerOwnedLocation,
    isPlayerAccessibleLocation,
    isDirectlyCarriedLocation,
    hasAccessiblePlayerItem,
    getStandingOnItemKey,
    isStandingOnItem,
    clearPlayerPosture,
    exitRequiresStandingOn,
    movePlayer,
    completeMovePlayer,
    getRoomDescriptionText,
    getRoomDescriptionParts,
    getRoomNoticeTexts,
    getNpcCueTexts,
    recordNpcMovementCue,
    chooseVariedText,
    updateTurnCues,
    getNearbyNpcDescriptionTexts,
    getNearbyNpcs,
    getAdjacentRoomKeys,
    isExitTraversableForNpcCue,
    buildConditionalText,
    parseExamineLinks,
    getExamineLinkTarget,
    showClueModal,
    examineClue,
    runClueOnExamine,
    getClueEffectResultMessage,
    startGame,
    acknowledgeEndingEncounter,
    getCurrentEnding,
    awardAchievement,
    getEarnedAchievements,
    getTotalAchievementCount,
    getRoomImage,
    getPlayerDisplayName,
    isItemConnectedToVisibleTarget,
    normalizeExitDefinition,
    getActiveExitVariant,
    deriveExitParts,
    getExitDisplayDefinition,
    isExitVisible,
    buildExitText,
    getItemPropertyValue,
    getExitBlockedMessage,
    capitalizeFirstLetter,
    getContainerContentsInlineText,
    getConnectedItemsInlineText,
    shouldListItemInRoom,
    isHiddenItem,
    findItem,
    isReachableItem,
    canActOnItem,
    findItemInCollection,
    findItemsInScope,
    getConnectedItemsForTarget,
    getConnectedTargetForItem,
    collectItemsInCollection,
    findItemInGameModel,
    deleteItem,
    deleteItemInGameModel,
    containsCollection,
    moveItem,
    examineItem,
    readItem,
    getItemDescription,
    formatInlineList,
    getVisibleContainerContentsMessage,
    getContainerOpenMessage,
    getItemReferenceText,
    getItemDisplayName,
    getProseItemName,
    formatItemBaseName,
    shouldLowercaseArticleName,
    getIndefiniteArticle,
    getAvailableActions,
    getPutTargets,
    handleItemAction,
    chooseItemAction,
    enterItemInput,
    submitTextInput,
    getTextInputTargets,
    getRecordedTextActions,
    enterRecordedText,
    getRecordOptions,
    canRecordNote,
    getRecordButtonLabel,
    getMessageNoteActions,
    recordNote,
    inputValueMatches,
    chooseToolAction,
    eatItem,
    dropItem,
    pickUpItem,
    movePlayerItemToCollection,
    takeOutItem,
    putItemInContainer,
    performContainerPutAction,
    wearItem,
    removeWornItem,
    canSearchItem,
    searchItem,
    unlockContainer,
    lockContainer,
    openContainer,
    closeContainer,
    unlockDoor,
    lockDoor,
    openDoor,
    closeDoor,
    turnOnItem,
    turnOffItem,
    handleInsertion,
    moveItemToContainer,
    getKeyTargets,
    getInsertionTargets,
    getConnectionTargets,
    getDisconnectionTargets,
    connectItem,
    disconnectItem,
    disconnectOtherTargets,
    clearPlayerConnectableState,
    clearConnectableStateInItems,
    getToolActions,
    collectToolActions,
    toolCanUseCuttable,
    collectInsertionTargets,
    collectPutTargets,
    containerAcceptsItem,
    isPathPrefix,
    selectConditionalAction,
    performAction,
    performEffect,
    getItemChoiceOptions,
    chooseItemOption,
    getAllRootItemCollections,
    collectTimersInItems,
    revealItem,
    canPlaceItemTree,
    setItemIdByEffect,
    createItemByEffect,
    moveItemByEffect,
    getTargetItems,
    createExit,
    movePlayerByEffect,
    performUpdateAction,
    evaluateCondition,
    getRoomClue,
    checkEndings,
    endGame,
    pushItem,
    pullItem,
    climbItem,
    climbDownFromItem,
    pressItem,
    getMissionRoute,
    emitNpcReport,
    startMission,
    finishMission,
    advanceMissionTransport,
    advanceMissions,
    requestTransport,
    recordTransportNotice,
    holdTransportForBoarding,
    advanceTransports,
    startTimer,
    advanceTimers
};
const descriptions = createDescriptions(api);
api.describe = descriptions.describe;
api.getDescription = descriptions.getDescription;
api.events = createEvents();
const worldEvents = createWorldEvents(api);
const actions = createActions(api);
api.schedule = createScheduler(api, worldEvents);
installDispatcher(api);
normalizePlayerState();
return api;
}
