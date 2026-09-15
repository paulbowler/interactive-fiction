import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, normaliseWorld } from '../packages/engine/index.js';
const world = () => ({title:'River Crossing',clock:{minutesPerTurn:1},player:{room:'westBank'},rooms:{westBank:{name:'West Bank'},eastBank:{name:'East Bank'},deck:{name:'Ferry Deck',items:{chest:{name:'Chest',fixed:true,container:true,items:{coin:{name:'Coin',portable:true}}}}}},transports:{ferry:{name:'Ferry',space:{room:'deck'},stop:'west',stops:{west:{room:'westBank'},east:{room:'eastBank'}}}}});

test('transport consequences and feedback belong to event listeners', () => {
    const nested = world();
    nested.rooms.westBank.items = {panel: {name: 'Panel', transport: {room: 'deck'}}};
    assert.throws(() => createGame(nested), /declare transport panel in the transports collection/);
    for (const alter of [
        model => {model.transports.ferry.notices = {departure: []};},
        model => {model.transports.ferry.stops.east.effects = [];},
    ]) {
        const model = world(); alter(model);
        assert.throws(() => createGame(model), /register .* listener|effects/);
    }
    const model = world(); model.transports.ferry.prose = {departed: 'The mooring rope drops.'};
    const game = createGame(model);
    game.events.on('transportDeparted', event => {
        game.state.player.crossings = (game.state.player.crossings || 0) + 1;
        game.state.player.turnObservations.push({room: 'westBank', text: game.getTransport(event.transport).prose.departed});
    });
    game.dispatch({type: 'start'});
    game.requestTransport({transport: 'ferry', destination: 'east'});
    game.dispatch({type: 'wait'});
    assert.equal(game.state.player.crossings, 1);
    assert.ok(game.state.player.turnObservations.some(entry => entry.text === model.transports.ferry.prose.departed));
    assert.equal(game.recordTransportNotice, undefined);
    assert.equal(game.getTransport('chest'), undefined, 'ordinary objects are not transport definitions');
});

test('ordinary transport controls need only a transport, stop and display message',()=>{
    const model=world();
    model.rooms.westBank.items={button:{name:'East crossing',pressable:{transport:'ferry',stop:'east',message:'The bell rings.'}}};
    const game=createGame(model);game.dispatch({type:'start'});
    const result=game.dispatch({type:'press',target:'button'});
    assert.equal(result.success,true);assert.equal(result.messages[0].args[0],'The bell rings.');
    assert.equal(game.getTransport('ferry').phase,'moving');
    assert.equal(game.state.player.elapsedMinutes,1);
    game.dispatch({type:'wait'});assert.equal(game.getTransport('ferry').stop,'east');
    for(const alter of [w=>w.rooms.westBank.items.button.pressable.stop='missing',w=>delete w.transports]) {
        const bad=structuredClone(model);alter(bad);assert.throws(()=>createGame(bad),/unknown transport or stop/);
    }
});

test('named arrival continuations survive saves and run for same-stop requests',()=>{
    const game=createGame(world()),seen=[];
    game.events.on('arrived',data=>seen.push([data,game.getTransport('ferry').request.destination]));
    game.requestTransport({transport:'ferry',destination:'west',event:'arrived',data:{stage:'board'}});
    game.load(game.save());game.advanceTransports();
    assert.deepEqual(seen,[[{stage:'board'},'west']]);
    assert.equal(game.getTransport('ferry').request,undefined);
});

test('mission events separate route preparation from arrival consequences',()=>{
    const model=world();
    model.rooms.westBank.exits = {eastBank: {}};
    model.rooms.eastBank.exits = {westBank: {}};
    model.rooms.westBank.items={courier:{name:'Courier',npc:{state:'resting',missions:{home:'westBank',idleState:'resting',states:{outbound:'going',searching:'working',returning:'returning'},routes:{westBank:[{to:'eastBank'}],eastBank:[{to:'westBank'}]},destinations:{delivery:{room:'eastBank',searchTurns:2}}}}}};
    const game=createGame(model),seen=[];game.dispatch({type:'start'});
    game.events.on('missionStepStarted',event=>seen.push(['step',event.from,event.to,game.findItem('courier').owner.key]));
    game.events.on('missionArrived',event=>seen.push(['arrival',event.destination,game.findItem('courier').owner.key]));
    game.startMission({item:'courier',destination:'delivery'});
    game.dispatch({type:'wait'});game.dispatch({type:'wait'});
    assert.deepEqual(seen,[['step','westBank','eastBank','westBank'],['arrival','delivery','eastBank']]);
});

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


test('stop arrays normalize identically to dictionaries and share saved journeys',()=>{
    const compact=world();compact.transports.ferry.stop='westBank';compact.transports.ferry.stops=['westBank','eastBank'];
    const explicit=structuredClone(compact);explicit.transports.ferry.stops={westBank:{room:'westBank'},eastBank:{room:'eastBank'}};
    const before=structuredClone(compact);
    assert.deepEqual(normaliseWorld(compact),normaliseWorld(explicit));assert.deepEqual(compact,before);
    const a=createGame(compact),b=createGame(explicit);
    for(const g of [a,b]) {g.dispatch({type:'start'});g.requestTransport({transport:'ferry',destination:'eastBank'});g.dispatch({type:'wait'});}
    assert.deepEqual(a.save(),b.save());
    const restored=createGame(compact).load(b.save());restored.dispatch({type:'wait'});a.dispatch({type:'wait'});
    assert.deepEqual(restored.save(),a.save());assert.equal(restored.getTransport('ferry').stop,'eastBank');
});

test('stop arrays reject empty lists, duplicates, non-string IDs and broken room references',()=>{
    for(const stops of [[],['westBank','westBank'],[null],[3],[{}],[''],['missing'],['deck'],['__proto__']]) {
        const input=world();input.transports.ferry.stop='westBank';input.transports.ferry.stops=stops;
        assert.throws(()=>normaliseWorld(input),/Invalid world at transports\.ferry\.stops/);
    }
});

test('opening an already docked transport emits one fact after the arrival continuation', () => {
    const game = createGame(world()), events = [];
    game.getTransport('ferry').boardingOpen = false;
    game.events.on('boardNow', () => events.push('continuation'));
    game.events.on('transportOpened', event => {
        assert.equal(game.getTransport('ferry').boardingOpen, true);
        assert.equal(game.getTransport('ferry').request.destination, 'west');
        events.push(event);
    });
    game.requestTransport({transport: 'ferry', destination: 'west', event: 'boardNow'});
    game.advanceTransports();
    assert.deepEqual(events, ['continuation', {transport: 'ferry', stop: 'west', actor: 'player'}]);
    game.requestTransport({transport: 'ferry', destination: 'west'});
    game.advanceTransports();
    assert.equal(events.length, 2);
});

test('mission readiness and named arrival variants use read-only rules and survive saves', () => {
    const game = createGame({title: 'Delivery', clock: {minutesPerTurn: 1}, player: {room: 'home'}, rooms: {
        home: {name: 'Home', exits: {away: {}}, items: {courier: {name: 'Courier', npc: {
            state: 'resting', missions: {home: 'home', idleState: 'resting',
                states: {outbound: 'going', searching: 'working', returning: 'returning'},
                routes: {home: [{to: 'away'}], away: [{to: 'home'}]},
                destinations: {delivery: {room: 'away', searchTurns: 1,
                    variants: [{id: 'urgent', searchTurns: 3, arrival: ['The courier starts the urgent delivery.']}]}}},
        }}}}, away: {name: 'Away', exits: {home: {}}},
    }});
    game.available('mission', 'courier', ctx => ctx.state.player.ordered === true);
    game.available('missionVariant', {target: 'courier', secondaryTarget: 'delivery', when: ctx => ctx.action.option === 'urgent'},
        ctx => ctx.state.player.express === true);
    game.dispatch({type: 'start'});
    const saved = game.save();
    assert.equal(game.startMission({item: 'courier', destination: 'delivery'}), false);
    assert.deepEqual(game.save(), saved);
    game.state.player.ordered = true; game.state.player.express = true;
    assert.equal(game.startMission({item: 'courier', destination: 'delivery'}), true);
    game.load(game.save());
    let selected;
    game.events.on('missionArrived', event => { selected = event.variant.id; });
    game.dispatch({type: 'wait'}); game.dispatch({type: 'wait'});
    assert.equal(selected, 'urgent');
    assert.equal(game.findItem('courier').item.properties.npc.mission.remaining, 3);
});
