import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, normaliseWorld, HANDLED, STOP, findEntity} from '../packages/engine/index.js';
import {validateWorldData} from '../packages/browser/build.js';

function world() {
  return {
    title:'The Courier', player:{room:'hall', carried:{
      letter:{name:'Letter',portable:true},
      bag:{name:'Bag',portable:true,container:true,opened:true,items:{coin:{portable:true}}},
    }},
    rooms:{
      hall:{exits:{garden:{}}, items:{
        courier:{name:'Courier',npc:{}},
        statue:{name:'Statue'},
        unseen:{npc:{},hidden:true},
      }},
      garden:{exits:{hall:{}},items:{gardener:{npc:{}}}},
    },
  };
}
const fresh=()=>createGame(world());

test('NPCs offer Talk and held items offer Give; default refusals are free and unchanged',()=>{
  const game=fresh(),before=game.save();
  assert.ok(game.getAvailableActions('courier').some(a=>a.id==='talk'));
  assert.deepEqual(game.getGiveTargets('letter').map(t=>t.key),['courier']);
  assert.ok(game.getAvailableActions('letter').some(a=>a.id==='give:courier'));
  for(const action of [{type:'talk',target:'courier'},{type:'give',target:'letter',secondaryTarget:'courier'}]){
    const result=game.dispatch(action);
    assert.equal(result.success,false);
    assert.match(result.messages[0].args[0],/nothing to say|does not want/);
    assert.deepEqual(game.save(),before);
  }
});
test('Talk and Give share scope and availability checks before replacements',()=>{
  const game=fresh();let called=0;
  game.instead('*',ctx=>{called++;return HANDLED;});
  for(const target of ['statue','unseen','gardener','missing'])
    assert.equal(game.dispatch({type:'talk',target}).status,STOP);
  for(const [target,recipient] of [['coin','courier'],['letter','statue'],['letter','gardener'],['letter','unseen'],['letter','missing']])
    assert.equal(game.dispatch({type:'give',target,secondaryTarget:recipient}).status,STOP);
  assert.equal(called,0);
  game.available('talk','courier',()=>false);
  game.available('give',{target:'letter',secondaryTarget:'courier'},()=>false);
  assert.ok(!game.getAvailableActions('courier').some(a=>a.id==='talk'));
  assert.ok(!game.getAvailableActions('letter').some(a=>a.id==='give:courier'));
  assert.equal(game.dispatch({type:'give:courier',target:'letter'}).status,STOP);
  assert.equal(game.dispatch({type:'talk',target:'courier'}).status,STOP);
  assert.equal(called,0);
});
test('acceptance transfers ownership, publishes visible facts and commits exactly once',()=>{
  const game=fresh();const events=[];let after=0;
  game.events.on('itemMoved',({item})=>{
    if(item==='letter') assert.equal(game.findItem('letter').owner.type,'npc');
  });
  game.events.on('itemGiven',e=>events.push(e));
  game.after('give','letter',()=>after++);
  game.instead('give',{target:'letter',secondaryTarget:'courier'},ctx=>{
    assert.equal(ctx.game.transferToNpc(ctx.action.target,ctx.action.secondaryTarget),true);
    ctx.commit();return HANDLED;
  });
  const minutes=game.state.player.elapsedMinutes;
  assert.equal(game.dispatch({type:'give:courier',target:'letter'}).success,true);
  assert.equal(game.state.player.elapsedMinutes,minutes+1);
  assert.equal(game.findItem('letter').owner.key,'courier');
  assert.equal(game.findItem('letter').accessible,false);
  assert.equal(game.state.player.carried.letter,undefined);
  assert.deepEqual(events,[{item:'letter',recipient:'courier'}]);
  assert.equal(after,0,'instead replacement owns consequences');
  assert.equal(game.dispatch({type:'take',target:'letter'}).status,STOP);
  assert.deepEqual(game.getAvailableActions('letter'),[]);
  assert.equal(game.transferToNpc('letter','courier'),false);
});
test('NPC inventories normalize recursively, move with owners, and survive saves and timers',()=>{
  const model=world();
  model.rooms.hall.items.courier.npc.inventory={
    satchel:{container:true,opened:true,items:{seal:{portable:true,description:{default:'A seal.'}}}},
  };
  validateWorldData(model);
  const original=structuredClone(model),game=createGame(model);
  assert.deepEqual(model,original);
  assert.equal(game.getDescription('seal'),'A seal.');
  assert.equal(findEntity(game.state,'seal'),game.findItem('seal').item);
  assert.equal(game.isPlayerOwnedLocation(game.findItem('seal')),false);
  let expired=0;game.events.on('expires',()=>expired++);
  game.startTimer({item:'seal',turns:1,event:'expires',justStarted:false});
  game.moveItem('courier',game.state.rooms.garden.items);
  assert.equal(game.findItem('seal').path[1],'garden');
  assert.equal(game.canTalkTo('courier'),false);
  game.dispatch({type:'go',target:'garden'});
  assert.equal(expired,1);
  const saved=game.save(),restored=createGame(model);
  restored.load(saved);
  assert.deepEqual(restored.save(),saved);
  assert.equal(restored.findItem('seal').accessible,false);
  restored.context().move('seal',{type:'carried'});
  assert.ok(restored.state.player.carried.seal);
  restored.context().move('seal',{type:'npc',item:'courier'});
  assert.equal(restored.findItem('seal').owner.type,'npc');
});
test('NPC ownership rejects duplicates, cycles and malformed saves atomically',()=>{
  const model=world();
  model.rooms.hall.items.courier.npc.inventory={letter:{portable:true}};
  assert.throws(()=>normaliseWorld(model),/duplicate/);
  const game=fresh(),before=game.save();
  for(const change of [
    s=>s.rooms.hall.items.courier.properties.npc.inventory=[],
    s=>s.rooms.hall.items.courier.properties.npc.inventory=null,
    s=>s.rooms.hall.items.courier.properties.npc.inventory=false,
    s=>s.player.carried.bag.properties.container.items=false,
    s=>s.rooms.hall.items.courier.properties.npc.inventory={letter:{properties:{portable:true}}},
    s=>s.rooms.hall.items.courier.properties.npc.talk={message:42},
  ]){
    const bad=structuredClone(before);change(bad);
    assert.throws(()=>game.load(bad));
    assert.deepEqual(game.save(),before);
  }
  game.context().move('courier',{type:'container',item:'bag'});
  const bag=game.findItem('bag').item, snapshot=game.save();
  assert.equal(game.transferToNpc('bag','courier'),false);
  assert.deepEqual(game.save(),snapshot);
  assert.equal(game.moveItem('bag',game.findItem('courier').item.properties.npc.inventory ||= {}),null);
  assert.equal(game.findItem('bag').item,bag);
});
test('social response text and controls are model-owned, and Talk can be replaced',()=>{
  const model=world();
  model.rooms.hall.items.courier.npc={
    talk:{message:'Pas maintenant.',title:'Conversation',label:'Parler'},
    give:{message:'Non merci.',title:'Cadeau',label:'Donner à'},
  };
  validateWorldData(model);
  const game=createGame(model);
  assert.equal(game.getAvailableActions('courier').find(a=>a.id==='talk').label,'Parler');
  assert.equal(game.getAvailableActions('letter').find(a=>a.id==='give:courier').label,'Donner à Courier');
  assert.equal(game.dispatch({type:'talk',target:'courier'}).messages[0].args[0],'Pas maintenant.');
  assert.equal(game.dispatch({type:'give',target:'letter',secondaryTarget:'courier'}).messages[0].args[0],'Non merci.');
  game.instead('talk','courier',ctx=>{ctx.set('courier','properties.met',true);ctx.commit();return HANDLED;});
  assert.equal(game.dispatch({type:'talk',target:'courier'}).success,true);
  assert.equal(game.findItem('courier').item.properties.met,true);
});
