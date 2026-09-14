// This is the entire bespoke controller for this game. Ordinary actions need no scripts.
export function register(game) {
    game.after('take', 'letter', ctx => {
        ctx.state.player.letterDiscovered = true;
        ctx.emit('letterDiscovered');
    });
    game.events.on('letterDiscovered', () => game.schedule.afterTurns(2, 'dusk'));
    game.events.on('dusk', () => { game.state.player.dusk = true; });
}
