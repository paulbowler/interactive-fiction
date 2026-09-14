import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, normaliseWorld} from '../packages/engine/index.js';
const world = () => ({title:'Gallery', player:{room:'gallery'}, rooms:{gallery:{
    scenery:{lamp:{name:'street lamp',title:'Street Lamp',description:'A warm light.'},wall:{title:'Wall'}},
    items:{key:{name:'Brass Key',portable:true}},
}, hall:{scenery:{lamp:{name:'oil lamp'}}}}});
test('shorthand uses current scenery names, explicit labels override, and emphasis remains intact',()=>{
    const game=createGame(world());
    assert.deepEqual(game.parseExamineLinks('The [[lamp]], [[glow|lamp]] and **wall**.'),[
        {type:'text',text:'The '},{type:'examine',text:'street lamp',clueKey:'lamp'},
        {type:'text',text:', '},{type:'examine',text:'glow',clueKey:'lamp'},
        {type:'text',text:' and '},{type:'accent',text:'wall'},{type:'text',text:'.'},
    ]);
    assert.equal(game.parseExamineLinks('[[lamp]]',game.state.rooms.hall.clues)[0].text,'oil lamp');
    assert.equal(game.parseExamineLinks('[[wall]]')[0].text,'Wall');
    assert.equal(game.parseExamineLinks('[[unknown]]')[0].text,'unknown');
    assert.equal(game.getExamineLinkTarget('unknown',game.state.rooms.gallery.clues),null);
    assert.equal(game.parseExamineLinks('[[item:key]]')[0].text,'Brass Key');
    assert.equal(game.parseExamineLinks('[[key|item:key]]')[0].text,'key');
    assert.deepEqual(game.parseExamineLinks('Unfinished [[lamp'),[{type:'text',text:'Unfinished [[lamp'}]);
});
test('renamed scenery and saved names resolve afresh; popup titles are independent',()=>{
    const game=createGame(world());
    game.state.rooms.gallery.clues.lamp.name='iron lamp';
    const saved=game.save(),restored=createGame(world()).load(saved);
    assert.equal(restored.parseExamineLinks('[[lamp]]')[0].text,'iron lamp');
    assert.deepEqual(restored.save(),saved);
    assert.equal(restored.dispatch({type:'examineClue',target:'gallery:lamp'}).messages[0].args[1],'Street Lamp');
    delete restored.state.rooms.gallery.clues.lamp.title;
    assert.equal(restored.dispatch({type:'examineClue',target:'gallery:lamp'}).messages[0].args[1],'iron lamp');
});
test('scenery names must be nonempty strings',()=>{
    for(const name of [7,false,'','   ']){const input=world();input.rooms.gallery.scenery.lamp.name=name;assert.throws(()=>normaliseWorld(input),/scenery.lamp.name.*nonempty string/);}
});
