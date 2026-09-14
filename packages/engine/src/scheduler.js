import { cloneSerializable } from './serialization.js';
export function createScheduler(game, worldEvents) {
    function state() { return game.state.runtime ||= {}; }
    return {
        afterTurns(turns, event, data = null) {
            if (!Number.isSafeInteger(turns) || turns < 0 || typeof event !== 'string' || !event.trim()) throw new Error('Invalid scheduled event');
            const payload = cloneSerializable(data);
            const runtime = state();
            const id = (runtime.nextScheduleId || 0) + 1;
            const due = (runtime.turn || 0) + Math.max(1, turns);
            if (!Number.isSafeInteger(id) || !Number.isSafeInteger(due)) throw new Error('Schedule exceeds safe integer range');
            runtime.scheduled ||= [];
            runtime.nextScheduleId = id;
            runtime.scheduled.push({ id, due, event, data: payload });
            return id;
        },
        cancel(id) { const runtime = state(); runtime.scheduled = (runtime.scheduled || []).filter(job => job.id !== id); },
        advance() {
            // Preserve the game's established order and justStarted timer grace.
            worldEvents.advanceTransports();
            worldEvents.advanceTimers();
            worldEvents.advanceMissions();
            const runtime = state();
            runtime.turn = (runtime.turn || 0) + 1;
            const due = (runtime.scheduled || []).filter(job => job.due <= runtime.turn);
            runtime.scheduled = (runtime.scheduled || []).filter(job => job.due > runtime.turn);
            for (const job of due) game.events.emit(job.event, job.data);
        }
    };
}
