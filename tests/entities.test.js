import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, findEntity} from '../packages/engine/index.js';
const world = {
  "title": "River Post",
  "player": {
    "room": "bank"
  },
  "rooms": {
    "bank": {
      "scenery": {
        "sign": {
          "name": "Sign",
          "prose": {
            "welcome": "Welcome"
          }
        }
      },
      "items": {
        "bag": {
          "container": true,
          "opened": true,
          "items": {
            "letter": {
              "portable": true,
              "prose": {
                "read": [
                  "Dear friend",
                  "Come soon"
                ]
              }
            }
          }
        }
      }
    }
  },
  "items": {
    "copy": {
      "portable": true,
      "prose": {
        "read": "A copy"
      }
    }
  }
};
test('entity and context queries track containment and restored state',()=>{
 const game=createGame(world), ctx=game.context();
 assert.equal(ctx.inContainer('letter','bag'),true);
 assert.equal(ctx.inRoom('letter','bank'),false,'direct containment only');
 assert.equal(ctx.get('letter','portable'),true);
 assert.equal(findEntity(game.state,'bank:sign').name,'Sign');
 assert.equal(game.getEntity('copy'),undefined);
 assert.equal(game.getEntity('copy',{includePrototypes:true}).prose.read,'A copy');
 const saved=game.save();ctx.move('letter',{type:'room',room:'bank'});
 assert.equal(ctx.inRoom('letter','bank'),true);
 game.load(saved);
 assert.equal(ctx.inContainer('letter','bag'),true,'helpers reacquire current state');
 assert.equal(game.getEntity('missing'),undefined);
 game.state.rooms.bank.items['postal:stamp']={description:'A stamp.',properties:{}};
 assert.equal(game.getDescription('postal:stamp'),'A stamp.','persistent object IDs still resolve when they contain a colon');
});
test('prose reads validate data without mutating or sharing arrays',()=>{
 const game=createGame(world), saved=game.save();
 const paragraphs=game.readProse('letter','read'); paragraphs.push('changed');
 assert.deepEqual(game.readProse('letter','read'),['Dear friend','Come soon']);
 assert.equal(game.readProse('bank:sign','welcome'),'Welcome');
 assert.equal(game.readProse('copy','read'),'A copy');
 assert.throws(()=>game.readProse('missing','read'),/Missing prose owner/);
 assert.throws(()=>game.readProse('bank','missing'),/Missing or invalid report prose/);
 assert.deepEqual(game.save(),saved);
});
