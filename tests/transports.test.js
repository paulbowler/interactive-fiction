import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, normaliseWorld } from '../packages/engine/index.js';
const world = () => ({title:'River Crossing',clock:{minutesPerTurn:1},player:{room:'westBank'},rooms:{westBank:{name:'West Bank'},eastBank:{name:'East Bank'},deck:{name:'Ferry Deck',items:{chest:{name:'Chest',fixed:true,container:true,items:{coin:{name:'Coin',portable:true}}}}}},transports:{ferry:{name:'Ferry',space:{room:'deck'},stop:'west',stops:{west:{room:'westBank'},east:{room:'eastBank'}}}}});

test('transport normalization supplies defaults and inspectable connections without a control object',()=>{
    const input=world(), before=structuredClone(input), state=normaliseWorld(input);
    assert.deepEqual(input,before);
    assert.deepEqual(state.transports.ferry,{...input.transports.ferry,boardingOpen:true,phase:'idle',queue:[]});
    assert.deepEqual(state.rooms.deck.exits.eastBank.transport,{id:'ferry',stop:'east'});
    assert.deepEqual(normaliseWorld(state),state);
    createGame(input).validateWorld(state);
});

test('boarding, travel, queue ordering, events and mid-journey saves preserve occupants and cargo',()=>{
    const game=createGame(world()), events=[];game.dispatch({type:'start'});
    for(const name of ['transportDeparted','transportArrived'])game.events.on(name,data=>events.push([name,data]));
    assert.ok(game.dispatch({type:'go',target:'deck'}).success);
    assert.equal(game.state.player.currentRoom,'deck');
    assert.equal(game.dispatch({type:'go',target:'eastBank'}).success,false);
    assert.ok(game.requestTransport({transport:'ferry',destination:'east'}));
    assert.equal(game.requestTransport({transport:'ferry',destination:'east'}),false);
    assert.ok(game.requestTransport({transport:'ferry',destination:'west'}));
    game.dispatch({type:'wait'});
    assert.equal(game.getTransport('ferry').phase,'moving');
    assert.equal(game.getTransport('ferry').boardingOpen,false);
    assert.equal(game.state.player.currentRoom,'deck');
    assert.equal(game.findItem('coin').owner.key,'chest');
    const restored=createGame(world()).load(JSON.parse(JSON.stringify(game.save())));
    for(const g of [game,restored])g.dispatch({type:'wait'});
    assert.deepEqual(restored.save(),game.save());
    assert.equal(game.getTransport('ferry').stop,'east');
    assert.equal(game.getTransport('ferry').boardingOpen,true);
    assert.deepEqual(events.map(([name])=>name),['transportDeparted','transportArrived']);
    assert.equal(events[0][1].from,'west');
    assert.equal(game.getTransport('ferry').queue[0].destination,'west');
    assert.ok(game.dispatch({type:'go',target:'eastBank'}).success);
});

test('unknown stops, invalid spaces and malformed saved state fail early and atomically',()=>{
    for(const change of [w=>w.transports.ferry.space={object:'chest'},w=>w.transports.ferry.stop='missing',w=>w.transports.ferry.stops.east.room='missing',w=>w.transports.ferry.boardingOpen='true',w=>w.transports.second=structuredClone(w.transports.ferry),w=>w.transports.deck=w.transports.ferry,w=>w.transports.ferry.stops.east.room='westBank']){
        const w=world();change(w);assert.throws(()=>createGame(w),/Invalid world/);
    }
    const game=createGame(world()),saved=game.save(),bad=structuredClone(saved);
    bad.transports.ferry.phase='moving';
    assert.throws(()=>game.load(bad),/moving transport/);assert.deepEqual(game.save(),saved);
    const disconnected=structuredClone(saved);delete disconnected.rooms.deck.exits.eastBank.transport;
    assert.throws(()=>game.load(disconnected),/boarding connection/);assert.deepEqual(game.save(),saved);
    for (const request of [null,{}, {transport:'toString',destination:'east'}, {transport:'ferry',destination:3}]) assert.equal(game.requestTransport(request),false);
    assert.equal(game.requestTransport({transport:'ferry',destination:'missing'}),false);
    assert.equal(game.requestTransport({transport:'ferry',destination:'east',actor:'missing'}),false);
    assert.equal(game.requestTransport({transport:'ferry',destination:'east',dwell:-1}),false);
});

test('closed boarding blocks entry while an ordinary same-stop request opens it',()=>{
    const w=world();w.transports.ferry.boardingOpen=false;w.transports.ferry.blockedMessage='The gangway is raised.';
    const game=createGame(w);game.dispatch({type:'start'});
    assert.equal(game.dispatch({type:'go',target:'deck'}).success,false);
    assert.equal(game.messages.at(-1).args[0],'The gangway is raised.');
    assert.ok(game.requestTransport({transport:'ferry',destination:'west'}));game.dispatch({type:'wait'});
    assert.equal(game.getTransport('ferry').boardingOpen,true);
    assert.ok(game.dispatch({type:'go',target:'deck'}).success);
});

test('NPC routes use transport IDs and map room destinations to named stops',()=>{
    const w=world();w.rooms.westBank.items={courier:{name:'Courier',npc:{state:'resting',missions:{home:'westBank',idleState:'resting',states:{outbound:'going',searching:'working',returning:'returning'},routes:{westBank:[{to:'eastBank',transport:'ferry'}],eastBank:[{to:'westBank',transport:'ferry'}]},destinations:{delivery:{room:'eastBank',searchTurns:1}}}}}};
    let game=createGame(w);game.dispatch({type:'start'});game.validateWorld(game.save());
    assert.ok(game.startMission({item:'courier',destination:'delivery'}));
    const stages=new Set(),locations=new Set();
    for(let turn=0;turn<40;turn++) {
        game.dispatch({type:'wait'});
        const npc=game.findItem('courier').item.properties.npc;
        if(npc.mission.ride)stages.add(npc.mission.ride.stage);
        locations.add(game.findItem('courier').owner.key);
        if(turn===5)game=createGame(w).load(game.save());
        if(!npc.mission.active)break;
    }
    assert.deepEqual([...stages].sort(),['boarded','ready','riding','waiting']);
    assert.deepEqual([...locations].sort(),['deck','eastBank','westBank']);
    assert.equal(game.findItem('courier').item.properties.npc.completed.delivery,true);
    assert.equal(game.findItem('courier').owner.key,'westBank');
    assert.equal(game.findItem('courier').item.properties.npc.mission.active,false);
});
