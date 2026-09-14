import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '@paulbowler/if-engine';
import { register } from './src/story.js';
const world=JSON.parse(fs.readFileSync(new URL('./data/game.json',import.meta.url)));
const create=()=>{const game=createGame(world);register(game);return game;};
test('letter discovery and delayed dusk survive a save',()=>{
    const game=create();
    for (const action of [{type:'start'},{type:'take',target:'brass-key'},{type:'unlock',target:'wooden-box',secondaryTarget:'brass-key'},{type:'open',target:'wooden-box'},{type:'take',target:'letter'}])
        assert.ok(game.dispatch(action).success);
    assert.ok(game.state.player.letterDiscovered);
    const restored=create().load(game.save());
    restored.dispatch({type:'wait'});
    assert.equal(restored.state.player.dusk,true);
});
