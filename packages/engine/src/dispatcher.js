import { createRules, CONTINUE, STOP, HANDLED } from './rules.js';

// The browser's existing labels remain accepted, while clients can use structured actions.
export function normalizeAction(request) {
    const action = { actor: 'player', ...request };
    const colon = action.type.indexOf(':');
    const type = colon === -1 ? action.type : action.type.slice(0, colon);
    const suffix = colon === -1 ? undefined : action.type.slice(colon + 1);
    // Clue targets contain a colon but action names do not consume that target.
    const aliases = { 'take out': 'take', removeFrom: 'take', 'climb down': 'climbDown', 'turn on': 'turnOn', 'turn off': 'turnOff', choice: 'choose', toolAction: 'tool', put: 'putIn', insert: 'useOn' };
    action.type = aliases[type] || type;
    if (suffix !== undefined) {
        if (['choice', 'toolAction', 'record'].includes(type)) action.index = Number(suffix);
        else if (type === 'unlock') { action.secondaryTarget = action.target; action.target = suffix; }
        else action.secondaryTarget = suffix;
    }
    return action;
}

export function installDispatcher(game) {
    const rules = createRules();
    const handlers = new Map();
    let active = false;
    for (const phase of ['before', 'instead', 'after', 'report']) game[phase] = (type, match, handler) => rules.add(phase, type, match, handler);
    game.registerAction = (type, handler) => {
        if (typeof type !== 'string' || !type.trim() || typeof handler !== 'function' || handler.constructor.name === 'AsyncFunction') throw new TypeError('Actions require a type and synchronous handler');
        const previous = handlers.get(type);
        handlers.set(type, handler);
        return () => { if (handlers.get(type) === handler) { if (previous) handlers.set(type, previous); else handlers.delete(type); } };
    };
    const direct = {
        go: ctx => game.movePlayer(ctx.action.target),
        start: () => game.startGame(), wait: () => game.waitTurn(),
        acknowledgeMessage: () => game.acknowledgeMessage(),
        acknowledgeEnding: () => game.acknowledgeEndingEncounter(),
        examine: ctx => game.examineItem(ctx.action.target),
        examineClue: ctx => { const [room, clue] = (ctx.action.target || '').split(':');
            if (room === game.state.player.currentRoom) return game.examineClue(game.getRoomClue(room, clue)); },
        chooseOption: ctx => game.chooseItemOption(ctx.action.target, ctx.action.choiceIndex, ctx.action.optionIndex),
        submitInput: ctx => game.submitTextInput(ctx.action.target, ctx.action.value),
        enterText: ctx => game.enterRecordedText(ctx.action.target, ctx.action.secondaryTarget),
        record: ctx => game.recordNote(ctx.action.target, ctx.action.index || 0),
        look: () => game.getRoomDescriptionText(game.state.player.currentRoom)
    };
    for (const [type, handler] of Object.entries(direct)) handlers.set(type, handler);
    const labels = { take: 'take', drop: 'drop', open: 'open', close: 'close', lock: 'lock', unlock: 'unlock', read: 'read', eat: 'eat', search: 'search', wear: 'wear', remove: 'remove', enter: 'enter', push: 'push', pull: 'pull', climb: 'climb', climbDown: 'climb down', turnOn: 'turn on', turnOff: 'turn off', press: 'press', input: 'input', choose: 'choice', tool: 'toolAction', putIn: 'put', putOn: 'put', useOn: 'insert', connect: 'connect', disconnect: 'disconnect' };
    for (const [type, label] of Object.entries(labels)) handlers.set(type, ctx => {
        const a = ctx.action;
        let id = label;
        if (type === 'take' && game.findItem(a.target)?.owner?.type === 'container') id = 'take out';
        if (['choose', 'tool'].includes(type)) id += `:${a.index}`;
        if (['putIn', 'putOn', 'useOn', 'connect', 'disconnect'].includes(type)) id += `:${a.secondaryTarget}`;
        if (type === 'unlock' && a.secondaryTarget) return game.handleItemAction(`unlock:${a.target}`, a.secondaryTarget);
        return game.handleItemAction(id, a.target);
    });
    game.dispatch = request => {
        if (!request || typeof request.type !== 'string' || !request.type.trim()) throw new Error('An action needs a type');
        for (const key of ['target', 'secondaryTarget', 'actor']) if (request[key] !== undefined && typeof request[key] !== 'string') throw new TypeError(`Action ${key} must be a string`);
        for (const key of ['index', 'choiceIndex', 'optionIndex']) if (request[key] !== undefined && (!Number.isSafeInteger(request[key]) || request[key] < 0)) throw new TypeError(`Action ${key} must be a nonnegative integer`);
        if (active) throw new Error('Nested action dispatch is not supported; emit an event instead');
        const action = normalizeAction(request);
        const ctx = game.context(action);
        const pending = game.state.player.pendingAction;
        const consequenceContext = action.type === 'acknowledgeMessage' && pending
            ? game.context({ type: 'go', actor: action.actor, target: pending.exitKey }) : ctx;
        const result = { action, status: CONTINUE, success: false, messages: [], value: undefined };
        game.messages = [];
        if (action.actor !== 'player' || (game.state.player.gameOver && !['acknowledgeMessage', 'acknowledgeEnding'].includes(action.type)) ||
            (game.state.player.pendingAction && action.type !== 'acknowledgeMessage')) return { ...result, status: STOP };
        active = true;
        game._begin();
        let standard = false;
        let afterRan = false;
        // Standard handlers commit at their historical success boundary. Run
        // consequences there, before timers/endings and subsequent reporting.
        game._afterCommit = () => {
            if (standard && !afterRan) { afterRan = true; rules.run('after', consequenceContext); }
        };
        try {
            result.status = rules.run('before', ctx);
            if (result.status === CONTINUE) result.status = rules.run('instead', ctx);
            if (result.status === CONTINUE) {
                const handler = handlers.get(action.type);
                standard = true;
                if (handler) result.value = handler(ctx);
                else result.status = STOP;
                result.success = game._successful();
            } else if (result.status === HANDLED) result.success = true;
            rules.run('report', Object.assign(ctx, { result }));
            game._finish();
            result.messages = game.messages.slice();
            result.choices = action.type === 'choose' && Boolean(game.findItemInGameModel(action.target)?.properties?.choices?.[action.index]?.options);
            return result;
        } finally { game._afterCommit = null; game._cancel(); active = false; }
    };
}
