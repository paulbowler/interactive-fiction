// Save data is JSON, not a container for callbacks or host objects.
export function cloneSerializable(value) {
    const ancestors = new Set();
    function check(entry, path) {
        if (entry === null || ['string', 'boolean'].includes(typeof entry)) return;
        if (typeof entry === 'number' && Number.isFinite(entry)) return;
        if (typeof entry !== 'object') throw new TypeError(`Non-JSON value at ${path}`);
        if (ancestors.has(entry)) throw new TypeError(`Circular state at ${path}`);
        const proto = Object.getPrototypeOf(entry);
        if (!Array.isArray(entry) && proto !== null && Object.getPrototypeOf(proto) !== null)
            throw new TypeError(`Non-JSON object at ${path}`);
        ancestors.add(entry);
        for (const key of Reflect.ownKeys(entry)) {
            if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
                throw new TypeError(`Unsafe state key at ${path}`);
            const descriptor = Object.getOwnPropertyDescriptor(entry, key);
            if (descriptor.get || descriptor.set) throw new TypeError(`State accessor at ${path}.${key}`);
            if (descriptor.enumerable) check(entry[key], `${path}.${key}`);
        }
        ancestors.delete(entry);
    }
    check(value, 'state');
    return JSON.parse(JSON.stringify(value));
}

export function validateRuntime(model) {
    const runtime = model.runtime;
    if (model.schemaVersion !== undefined && model.schemaVersion !== 1) throw new Error('Unsupported world schema version');
    if (runtime === undefined) return;
    if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) throw new Error('Invalid runtime state');
    for (const key of ['saveFormatVersion', 'worldSchemaVersion'])
        if (runtime[key] !== undefined && runtime[key] !== 1) throw new Error(`Unsupported ${key}`);
    for (const key of ['turn', 'nextScheduleId', 'randomSeed'])
        if (runtime[key] !== undefined && (!Number.isSafeInteger(runtime[key]) || runtime[key] < 0)) throw new Error(`Invalid runtime ${key}`);
    if (runtime.randomSeed > 0xffffffff) throw new Error('Invalid runtime randomSeed');
    if (runtime.scheduled !== undefined) {
        if (!Array.isArray(runtime.scheduled)) throw new Error('Invalid scheduled events');
        const ids = new Set();
        for (const job of runtime.scheduled) {
            if (!job || !Number.isSafeInteger(job.id) || job.id < 1 || ids.has(job.id) ||
                !Number.isSafeInteger(job.due) || job.due < 0 || typeof job.event !== 'string' || !job.event.trim())
                throw new Error('Invalid scheduled event');
            ids.add(job.id);
        }
        if ([...ids].some(id => id > (runtime.nextScheduleId || 0))) throw new Error('Invalid schedule sequence');
    }
}
