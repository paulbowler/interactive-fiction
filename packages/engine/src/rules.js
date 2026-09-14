export const CONTINUE = 'CONTINUE';
export const STOP = 'STOP';
export const HANDLED = 'HANDLED';

export function createRules() {
    const phases = { before: [], instead: [], after: [], report: [] };
    function matches(rule, ctx) {
        if (rule.type !== '*' && rule.type !== ctx.action.type) return false;
        const match = rule.match;
        if (typeof match === 'string') return ctx.action.target === match;
        if (typeof match === 'function') return match(ctx);
        return (!match?.target || match.target === ctx.action.target) &&
            (!match?.secondaryTarget || match.secondaryTarget === ctx.action.secondaryTarget) &&
            (!match?.when || match.when(ctx));
    }
    return {
        add(phase, type, match, handler) {
            if (!handler) { handler = match; match = null; }
            if (typeof type !== 'string' || !type.trim() || typeof handler !== 'function' || handler.constructor.name === 'AsyncFunction') throw new TypeError('Rules require a type and synchronous handler');
            const rule = { type, match, handler };
            phases[phase].push(rule);
            return () => { const i = phases[phase].indexOf(rule); if (i >= 0) phases[phase].splice(i, 1); };
        },
        run(phase, ctx) {
            for (const rule of [...phases[phase]]) {
                if (!matches(rule, ctx)) continue;
                const result = rule.handler(ctx) ?? CONTINUE;
                if (![CONTINUE, STOP, HANDLED].includes(result)) throw new Error(`Invalid ${phase} rule result: ${result}`);
                if (result !== CONTINUE) return result;
            }
            return CONTINUE;
        }
    };
}
