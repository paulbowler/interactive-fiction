// Synchronous FIFO delivery: nested emissions are queued, never recursive.
export function createEvents() {
    const listeners = new Map();
    const queue = [];
    let draining = false;
    return {
        on(name, handler) {
            if (typeof name !== 'string' || !name.trim() || typeof handler !== 'function' || handler.constructor.name === 'AsyncFunction') throw new TypeError('Events require a name and synchronous handler');
            const handlers = listeners.get(name) || [];
            handlers.push(handler);
            listeners.set(name, handlers);
            return () => { const i = handlers.indexOf(handler); if (i >= 0) handlers.splice(i, 1); };
        },
        emit(name, data) {
            if (typeof name !== 'string' || !name.trim()) throw new TypeError('Event name is required');
            queue.push({ name, data });
            if (draining) return;
            draining = true;
            let delivered = 0;
            try {
                while (queue.length) {
                    if (++delivered > 10000) throw new Error('Event cycle exceeded 10000 emissions');
                    const event = queue.shift();
                    for (const handler of [...(listeners.get(event.name) || [])]) handler(event.data);
                }
            } finally { draining = false; queue.length = 0; }
        }
    };
}
