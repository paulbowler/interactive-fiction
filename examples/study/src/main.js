import { createGame } from '@paulbowler/if-engine';
import { mountBrowser } from '@paulbowler/if-browser';
import { register } from './story.js';
export const browserView = mountBrowser(world => {
    const game = createGame(world);
    register(game);
    return game;
});
