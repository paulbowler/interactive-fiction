import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../packages/browser/build.js';
import { createGame } from '../packages/engine/index.js';
import { CONTINUE, STOP, HANDLED } from '../packages/engine/index.js';
const world=await loadWorld(new URL('../examples/study.json5',import.meta.url));
const fresh=()=>createGame(world);

test('named climb feedback queries preserve ordinary posture, turns and saved progress', () => {
    const game = createGame({title: 'Orchard', player: {room: 'garden'}, rooms: {garden: {name: 'Garden', items: {
        ladder: {name: 'ladder', climbable: {message: [
            {id: 'low', text: 'The branches remain overhead.'},
            {id: 'high', text: 'You can reach the branches.'},
        ]}},
    }}}});
    game.available('text', {target: 'ladder', when: ctx => ctx.action.field === 'climb'}, ctx =>
        ctx.action.option === (ctx.state.player.extended ? 'high' : 'low'));
    game.dispatch({type: 'start'});
    for (const extended of [false, true]) {
        game.state.player.extended = extended;
        const before = game.save();
        const expected = extended ? 'You can reach the branches.' : 'The branches remain overhead.';
        assert.equal(game.buildConditionalText(game.findItem('ladder').item.properties.climbable.message,
            false, {target: 'ladder', field: 'climb'}), expected);
        assert.deepEqual(game.save(), before, 'text queries do not mutate or advance time');
        const result = game.dispatch({type: 'climb', target: 'ladder'});
        assert.equal(result.success, true);
        assert.ok(result.messages.some(message => message.args.includes(expected)));
        assert.equal(game.state.player.elapsedMinutes, before.player.elapsedMinutes + 1);
        assert.equal(game.state.player.posture.item, 'ladder');
        game.load(JSON.parse(JSON.stringify(game.save())));
        assert.equal(game.dispatch({type: 'climbDown', target: 'ladder'}).success, true);
    }
    assert.equal(game.buildConditionalText('Plain feedback', false, {target: 'ladder', field: 'climb'}), 'Plain feedback');
});

test('actor report queries select named prose and recheck saved report visibility', () => {
    const game = createGame({title: 'Orchard', player: {room: 'garden'}, rooms: {
        garden: {name: 'Garden', items: {robin: {name: 'Robin', npc: {
            movementCue: {description: [{id: 'near', text: 'A flutter nearby.'}, {id: 'far', text: 'A distant flutter.'}]},
            turnCue: {variants: [{id: 'quiet', texts: ['A soft chirp.']}, {id: 'loud', texts: ['A loud chirp.']}]},
        }}}},
        orchard: {name: 'Orchard'},
    }});
    game.available('npcCue', 'robin', ctx => !ctx.state.player.deafened);
    game.available('text', {target: 'robin', when: ctx => ctx.action.field === 'movement'}, ctx =>
        ctx.action.option === (ctx.state.player.distant ? 'far' : 'near'));
    game.available('npcCueVariant', 'robin', ctx => ctx.action.option === (ctx.state.player.distant ? 'quiet' : 'loud'));
    game.dispatch({type: 'start'});
    const bird = game.findItem('robin').item;
    game.recordNpcMovementCue('robin', bird, 'orchard', 'garden');
    assert.deepEqual(game.getNpcCueTexts('garden'), ['A flutter nearby.']);
    game.updateTurnCues();
    assert.equal(game.state.player.movementCues[0].text, 'A flutter nearby.', 'fresh movement takes priority');
    game.updateTurnCues();
    assert.equal(game.state.player.movementCues[0].text, 'A loud chirp.');
    game.state.player.distant = true;
    game.updateTurnCues();
    assert.equal(game.state.player.movementCues[0].text, 'A soft chirp.');
    game.load(JSON.parse(JSON.stringify(game.save())));
    game.state.player.deafened = true;
    const saved = game.save();
    assert.deepEqual(game.getNpcCueTexts('garden'), []);
    assert.deepEqual(game.save(), saved, 'rendering is read-only');
    game.recordNpcMovementCue('robin', game.findItem('robin').item, 'garden', 'orchard');
    assert.deepEqual(game.save(), saved, 'unavailable reports consume no random choices or state');
    game.state.player.deafened = false;
    assert.deepEqual(game.getNpcCueTexts('garden'), ['A soft chirp.']);
});

test('reading, ending paragraphs and room images use named read-only selections', () => {
    const game = createGame({title: 'Orchard', player: {room: 'garden'}, rooms: {
        garden: {name: 'Garden', imageUrl: 'day.webp', imageVariants: [{id: 'night', imageUrl: 'night.webp'}], items: {
            letter: {name: 'Letter', readable: {text: [{id: 'sealed', text: 'Still sealed.'}, {id: 'opened', text: 'Meet at dusk.'}]}},
        }},
    }, endings: [{id: 'home', text: ['You return home.', [{id: 'day', text: 'Sunlight fills the hall.'}, {id: 'night', text: 'The hall is dark.'}]],
        encounter: {description: [{id: 'day', text: 'A warm welcome.'}, {id: 'night', text: 'Everyone is asleep.'}]}}]});
    game.available('text', 'letter', ctx => ctx.action.option === (ctx.state.player.opened ? 'opened' : 'sealed'));
    game.available('text', 'home', ctx => ctx.action.option === (ctx.state.player.night ? 'night' : 'day'));
    game.available('image', 'garden', ctx => ctx.state.player.night === true);
    game.dispatch({type: 'start'});
    for (const opened of [false, true]) {
        game.state.player.opened = opened;
        const result = game.dispatch({type: 'read', target: 'letter'});
        assert.equal(result.success, true);
        assert.ok(result.messages.some(message => message.args.includes(opened ? 'Meet at dusk.' : 'Still sealed.')));
    }
    for (const night of [false, true]) {
        game.state.player.night = night;
        const before = game.save();
        assert.equal(game.getRoomImage(game.state.rooms.garden).imageUrl, night ? 'night.webp' : 'day.webp');
        assert.deepEqual(game.getEndingText(game.state.endings[0]), ['You return home.', night ? 'The hall is dark.' : 'Sunlight fills the hall.']);
        assert.deepEqual(game.save(), before);
    }
    game.endGame(game.state.endings[0]);
    assert.equal(game.state.player.endingEncounter.text, 'Everyone is asleep.');
    game.load(JSON.parse(JSON.stringify(game.save())));
    assert.deepEqual(game.getEndingText(), ['You return home.', 'The hall is dark.']);
});

test('disabling manual unlocking preserves container opening feedback and capabilities', () => {
    const game = fresh();
    const box = game.findItem('wooden-box').item.properties.container;
    delete box.key;
    const remove = game.available('unlock', 'wooden-box', () => false);
    const before = game.save();
    const actions = game.getAvailableActions('wooden-box').map(action => action.id);
    assert.ok(actions.includes('open'));
    assert.ok(!actions.includes('unlock'));
    assert.equal(game.dispatch({type: 'unlock', target: 'wooden-box'}).success, false);
    assert.deepEqual(game.save(), before);
    assert.equal(box.lockable, true);
    remove();
    assert.ok(game.getAvailableActions('wooden-box').some(action => action.id === 'unlock'));
    assert.equal(game.dispatch({type: 'unlock', target: 'wooden-box'}).success, true);
});

test('unrelated world supports ordinary actions without story scripts',()=>{
    const game=fresh();
    game.validateWorld(game.state);
    game.dispatch({type:'start'});
    assert.equal(game.dispatch({type:'take',target:'letter'}).success,false);
    assert.equal(game.dispatch({type:'take',target:'statue'}).success,false);
    assert.equal(game.dispatch({type:'open',target:'wooden-box'}).success,false);
    for(const action of [
        {type:'take',target:'brass-key'}, {type:'unlock',target:'wooden-box',secondaryTarget:'brass-key'},
        {type:'open',target:'wooden-box'},{type:'take',target:'letter'},
        {type:'putOn',target:'letter',secondaryTarget:'desk'}, {type:'removeFrom',target:'letter'},
        {type:'putIn',target:'letter',secondaryTarget:'wooden-box'},
        {type:'close',target:'wooden-box'},{type:'lock',target:'wooden-box'},
        {type:'go',target:'hall'},{type:'drop',target:'brass-key'}
    ]) assert.equal(game.dispatch(action).success,true,JSON.stringify(action));
    assert.equal(game.findItem('letter').owner.key,'wooden-box');
    assert.equal(game.findItem('brass-key').owner.key,'hall');
    assert.equal(world.player.currentRoom,'study');
    assert.equal(fresh().findItem('brass-key').owner.key,'study');
});

test('before/instead/standard/after/report have explicit ordered outcomes',()=>{
    const game=fresh(), trace=[];
    game.before('take','brass-key',()=>{trace.push('before');return CONTINUE;});
    game.instead('take',{when:ctx=>ctx.target.properties.portable},()=>{trace.push('instead');return CONTINUE;});
    game.after('take','brass-key',ctx=>{assert.equal(ctx.state.player.carried['brass-key'].name,'Brass Key');trace.push('after');ctx.emit('keyTaken');});
    game.events.on('keyTaken',()=>trace.push('event'));
    game.report('take',()=>{trace.push('report');});
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).success,true);
    assert.deepEqual(trace,['before','instead','after','event','report']);
    trace.length=0;
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).success,false);
    assert.deepEqual(trace,['before','instead','report']);
});

test('blocked and replaced actions never run the standard action or after rules',()=>{
    const game=fresh();let after=0;
    game.after('take',()=>{after++;});
    const remove=game.before('take','brass-key',ctx=>{ctx.say('Wait.');return STOP;});
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).status,STOP);
    assert.equal(game.findItem('brass-key').owner.key,'study');
    remove();
    game.instead('take','brass-key',ctx=>{ctx.say('It turns to dust.');ctx.game.deleteItem('brass-key');ctx.commit();return HANDLED;});
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).status,HANDLED);
    assert.equal(game.findItem('brass-key'),null);
    assert.equal(after,0);
    game.before('open',()=>true);
    assert.throws(()=>game.dispatch({type:'open',target:'wooden-box'}),/Invalid before rule result/);
});

test('events use FIFO delivery and stop cycles without recursive stack growth',()=>{
    const game=fresh(),seen=[];
    game.events.on('a',()=>{seen.push('a1');game.events.emit('b');});
    game.events.on('a',()=>seen.push('a2'));
    game.events.on('b',()=>seen.push('b'));
    game.events.emit('a');assert.deepEqual(seen,['a1','a2','b']);
    const off=game.events.on('cycle',()=>game.events.emit('cycle'));
    assert.throws(()=>game.events.emit('cycle'),/Event cycle/);off();
    game.events.emit('b');assert.equal(seen.at(-1),'b');
});

test('scheduled events count successful turns and survive serialization',()=>{
    const game=fresh();game.dispatch({type:'start'});
    const events=[];game.events.on('notice',data=>events.push(data));
    game.schedule.afterTurns(2,'notice',{text:'Dusk'});
    game.dispatch({type:'take',target:'statue'});
    game.dispatch({type:'look'});
    game.dispatch({type:'wait'});assert.deepEqual(events,[]);
    const restored=fresh().load(game.save());restored.events.on('notice',data=>events.push(data));
    restored.dispatch({type:'wait'});assert.deepEqual(events,[{text:'Dusk'}]);
    restored.dispatch({type:'wait'});assert.equal(events.length,1);
});

test('deferred movement saves its continuation and runs go consequences on acknowledgement',()=>{
    const model=structuredClone(world);
    model.rooms.study.exits.hall.beforeMove={message:'You pause at the threshold.'};
    const game=createGame(model);game.dispatch({type:'start'});
    game.dispatch({type:'go',target:'hall'});
    assert.equal(game.state.player.currentRoom,'study');
    const restored=createGame(model).load(JSON.parse(JSON.stringify(game.save())));
    let entered=0;restored.after('go','hall',()=>{entered++;});
    assert.equal(restored.dispatch({type:'wait'}).status,STOP);
    restored.dispatch({type:'acknowledgeMessage'});
    assert.equal(restored.state.player.currentRoom,'hall');
    assert.equal(entered,1);
    assert.equal(restored.state.player.elapsedMinutes,1);
    assert.equal(restored.state.player.pendingAction,undefined);
});

test('actions can be registered without changing the engine',()=>{
    const game=fresh();
    game.registerAction('sing',ctx=>{ctx.state.player.sang=true;ctx.say('La!');ctx.commit();});
    assert.equal(game.dispatch({type:'sing'}).success,true);
    assert.equal(game.state.player.sang,true);
});

test('handled feedback is not success unless the replacement commits', () => {
    const game=fresh();
    game.instead('take','brass-key',ctx=>{ctx.say('The key resists.');return HANDLED;});
    const result=game.dispatch({type:'take',target:'brass-key'});
    assert.equal(result.status,HANDLED);
    assert.equal(result.success,false);
    assert.equal(game.state.player.elapsedMinutes,0);
});

test('one request commits at most one turn even when a consequence also commits', () => {
    const game=fresh();let consequences=0;
    game.after('take','brass-key',ctx=>{consequences++;ctx.commit();});
    game.dispatch({type:'take',target:'brass-key'});
    assert.equal(consequences,1);
    assert.equal(game.state.player.elapsedMinutes,1);
});

test('examination rules receive scenery and can complete its response before display', () => {
    const model=structuredClone(world);
    model.rooms.study.clues={painting:{title:'Painting',description:'A painted landscape.'}};
    const game=createGame(model);
    game.after('examineClue','study:painting',ctx=>{
        assert.equal(ctx.target.title,'Painting');
        assert.equal(ctx.target.examined,true);
        ctx.response.description+=' A signature catches your eye.';
        ctx.state.player.sawSignature=true;
    });
    const result=game.dispatch({type:'examineClue',target:'study:painting'});
    assert.equal(result.success,true);
    assert.equal(game.state.player.elapsedMinutes,0);
    assert.equal(result.messages[0].args[0],'A painted landscape. A signature catches your eye.');
    assert.equal(game.state.player.sawSignature,true);
});

test('an examination consequence may charge its discovery turn exactly once', () => {
    const game=fresh();
    game.after('examine','brass-key',ctx=>{if (!ctx.target.discovered) {ctx.target.discovered=true;ctx.commit();}});
    game.dispatch({type:'examine',target:'brass-key'});
    assert.equal(game.state.player.elapsedMinutes,1);
    game.dispatch({type:'examine',target:'brass-key'});
    assert.equal(game.state.player.elapsedMinutes,1);
});

test('availability queries do not run action rules and stale requests are rechecked', () => {
    const game=fresh();let actions=0;
    game.available('take','brass-key',ctx=>ctx.state.player.allowed === true);
    game.instead('take','brass-key',ctx=>{actions++;ctx.commit();return HANDLED;});
    assert.ok(!game.getAvailableActions('brass-key').some(action=>action.id==='take'));
    assert.equal(actions,0);
    game.state.player.allowed=true;
    const before=game.save();
    assert.ok(game.getAvailableActions('brass-key').some(action=>action.id==='take'));
    assert.deepEqual(game.save(),before);
    game.state.player.allowed=false;
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).status,STOP);
    assert.equal(actions,0);
});

test('replacement rules cannot act on an out-of-scope object or scenery', () => {
    const game=fresh();let ran=0;
    game.instead('take','brass-key',()=>{ran++;return HANDLED;});
    game.state.player.currentRoom='hall';
    assert.equal(game.dispatch({type:'take',target:'brass-key'}).status,STOP);
    assert.equal(ran,0);
    game.after('examineClue','study:unknown',()=>{ran++;});
    assert.equal(game.dispatch({type:'examineClue',target:'study:unknown'}).status,STOP);
    assert.equal(ran,0);
});

test('named choices and recorded input enter the same rule pipeline as browser aliases', () => {
    const model=structuredClone(world);
    model.rooms.study.items.console={name:'Console',properties:{choices:[{id:'listen',label:'Listen'}],input:{notesOnly:true}}};
    model.player.carried.note={name:'Note',properties:{portable:true,textValue:'blue'}};
    const game=createGame(model),seen=[];
    game.instead('choose','console',ctx=>{seen.push(ctx.action.choice);return HANDLED;});
    game.instead('submitInput','console',ctx=>{seen.push(ctx.action.value);return HANDLED;});
    game.dispatch({type:'choice:0',target:'console'});
    game.dispatch({type:'choose',target:'console',choice:'listen'});
    game.dispatch({type:'enterText',target:'note',secondaryTarget:'console'});
    assert.deepEqual(seen,['listen','listen','blue']);
});

test('tool rules match named operations even when other menu entries disappear', () => {
    const model=structuredClone(world);
    model.player.carried.cutters={name:'Cutters',properties:{tool:{capabilities:['cut']}}};
    model.rooms.study.items.wires={name:'Wires',properties:{cuttable:{capability:'cut',options:[
        {id:'red',label:'Cut red'}, {id:'blue',label:'Cut blue'}
    ]}}};
    const game=createGame(model),seen=[];
    game.available('tool',{secondaryTarget:'wires'},ctx=>ctx.action.option!=='red');
    game.instead('tool',{target:'cutters',secondaryTarget:'wires'},ctx=>{seen.push(ctx.action.option);return HANDLED;});
    assert.equal(game.getToolActions('cutters')[0].id,'blue');
    game.dispatch({type:'toolAction:0',target:'cutters'});
    game.dispatch({type:'tool',target:'cutters',secondaryTarget:'wires',option:'blue'});
    game.dispatch({type:'tool',target:'cutters',secondaryTarget:'wires',option:'red'});
    assert.deepEqual(seen,['blue','blue']);
});

test('ordinary push and pull use capability prose without executable configuration', () => {
    const model=structuredClone(world);
    model.rooms.study.items.cart={name:'Cart',properties:{pushable:{message:'It rolls away.'},pullable:{message:'It rolls back.'}}};
    const game=createGame(model);
    assert.equal(game.dispatch({type:'push',target:'cart'}).messages[0].args[0],'It rolls away.');
    assert.equal(game.findItem('cart').item.properties.pushable.pushed,true);
    assert.equal(game.dispatch({type:'pull',target:'cart'}).messages[0].args[0],'It rolls back.');
    assert.equal(game.findItem('cart').item.properties.pushable.pushed,false);
    assert.equal(game.state.player.elapsedMinutes,2);
});

test('ending reactions receive the completed ending as a world fact', () => {
    const game=fresh(),seen=[];
    game.events.on('gameEnded',event=>seen.push([event.ending,game.state.player.gameOver]));
    game.endGame({id:'finished'});
    assert.deepEqual(seen,[['finished',true]]);
});

test('entity timers retain grace and replacement semantics with serializable event payloads', () => {
    const game=fresh(),events=[];
    game.dispatch({type:'start'});
    game.events.on('ready',data=>events.push(data));
    const data={stage:2};
    game.startTimer({item:'brass-key',turns:2,event:'ready',data});
    data.stage=99;
    game.dispatch({type:'wait'});
    assert.equal(game.findItem('brass-key').item.properties.timer.remaining,2);
    game.load(game.save());
    game.dispatch({type:'wait'});
    assert.deepEqual(events,[]);
    game.dispatch({type:'wait'});
    assert.deepEqual(events,[{stage:2}]);
    assert.equal(game.findItem('brass-key').item.properties.timer,undefined);
    game.startTimer({item:'brass-key',turns:8,event:'ready',data:'cancelled'});
    game.startTimer({item:'brass-key',turns:1,event:'ready',data:'replacement',justStarted:false});
    game.dispatch({type:'wait'});
    assert.deepEqual(events,[{stage:2},'replacement']);
    assert.throws(()=>game.startTimer({item:'brass-key',turns:1,event:'ready',data:()=>{}}),/Non-JSON/);
});

test('named cues and observations use read-only availability and observe turn transitions', () => {
    const game = createGame({title: 'Observatory', clock: {minutesPerTurn: 1}, player: {room: 'dome'},
        rooms: {dome: {name: 'Dome', description: 'A dark dome.',
            cues: [{id: 'moonVisible', text: 'Moonlight fills the dome.'}],
            observations: [{id: 'shuttersOpened', text: 'The shutters slide apart.'}],
            items: {shutters: {name: 'Shutters', openable: true, container: true}}}}});
    game.available('cue', 'dome', ctx => ctx.game.findItem('shutters').item.properties.container.opened);
    game.dispatch({type: 'start'});
    const saved = game.save();
    assert.deepEqual(game.getNpcCueTexts('dome'), []);
    assert.deepEqual(game.save(), saved);
    game.events.on('openShutters', () => game.context().set('shutters', 'properties.container.opened', true));
    game.schedule.afterTurns(1, 'openShutters');
    game.dispatch({type: 'wait'});
    assert.deepEqual(game.state.player.turnObservations, [{room: 'dome', text: 'The shutters slide apart.'}]);
    assert.ok(game.getNpcCueTexts('dome').join(' ').includes('Moonlight fills the dome.'));
    game.load(game.save());
    assert.ok(game.getNpcCueTexts('dome').join(' ').includes('Moonlight fills the dome.'));
    game.dispatch({type: 'wait'});
    assert.deepEqual(game.state.player.turnObservations, []);
    game.state.rooms.dome.cues = 'A steady hum fills the dome.';
    assert.ok(game.getNpcCueTexts('dome').includes('A steady hum fills the dome.'));
});

test('record availability is shared by note prompts and action validation', () => {
    const game = createGame({title: 'The Map Room', player: {room: 'study', carried: {
        notebook: {name: 'Notebook', container: true, opened: true},
    }}, rooms: {study: {name: 'Study', items: {
        chart: {name: 'Chart', recordable: {entry: 'bearing', container: 'notebook', message: 'Bearing recorded.'}},
    }}}, items: {bearing: {name: 'Bearing', portable: true}}});
    const remove = game.available('record', 'chart', () => false);
    const saved = game.save();
    assert.equal(game.canRecordNote('chart'), false);
    assert.deepEqual(game.getMessageNoteActions(['chart']), []);
    assert.equal(game.dispatch({type: 'record', target: 'chart'}).success, false);
    assert.deepEqual(game.save(), saved);
    remove();
    assert.equal(game.getMessageNoteActions(['chart']).length, 1);
    assert.equal(game.dispatch({type: 'record', target: 'chart'}).success, true);
    assert.equal(game.findItem('bearing').owner.key, 'notebook');
});

test('declared exit doors enforce locks and opening without story rules', () => {
    const world = {title: 'Two Rooms', player: {room: 'study'}, rooms: {
        study: {name: 'Study', exits: {hall: {door: 'oakDoor'}}, items: {
            oakDoor: {name: 'Oak Door', door: true, openable: true, lockable: true, locked: true,
                lockedMessage: 'The oak door is locked.'},
        }}, hall: {name: 'Hall', exits: {study: {door: 'oakDoor'}}},
    }};
    const game = createGame(world);
    assert.equal(game.dispatch({type: 'go', target: 'hall'}).success, false);
    assert.equal(game.messages[0].args[0], 'The oak door is locked.');
    assert.equal(game.dispatch({type: 'unlock', target: 'oakDoor'}).success, true);
    assert.equal(game.dispatch({type: 'go', target: 'hall'}).success, false);
    game.dispatch({type: 'open', target: 'oakDoor'});
    assert.equal(game.dispatch({type: 'go', target: 'hall'}).success, true);
    game.load(game.save());
    assert.equal(game.dispatch({type: 'go', target: 'study'}).success, true);
    const broken = structuredClone(world);
    broken.rooms.study.exits.hall.door = 'missing';
    assert.throws(() => createGame(broken), /expected an existing door ID/);
    const invalidSave = game.save();
    delete invalidSave.rooms.study.items.oakDoor.properties.door;
    assert.throws(() => game.load(invalidSave), /expected an existing door ID/);
    const removedDoor = game.save();
    delete removedDoor.rooms.study.items.oakDoor;
    assert.doesNotThrow(() => game.load(removedDoor));
});

test('exit visibility and travel availability are read-only and shared with passage controls and nearby actors', () => {
    const game = createGame({title: 'The Gallery', player: {room: 'gallery'}, rooms: {
        gallery: {name: 'Gallery', exits: {hall: {}}, items: {arch: {name: 'Arch', passage: {destination: 'hall'}}}},
        hall: {name: 'Hall', items: {curator: {name: 'Curator', npc: {nearbyDescription: 'A quiet cough.'}}}},
    }});
    game.available('exit', 'gallery', ctx => ctx.state.player.revealed === true);
    game.available('go', ctx => ctx.action.from !== 'gallery' || ctx.state.player.permitted === true);
    const saved = game.save();
    assert.ok(!game.getAvailableActions('arch').some(action => action.id === 'enter'));
    assert.deepEqual(game.getNearbyNpcs('gallery'), []);
    assert.equal(game.dispatch({type: 'go', target: 'hall'}).success, false);
    assert.deepEqual(game.save(), saved);
    game.state.player.revealed = true;
    assert.ok(game.getAvailableActions('arch').some(action => action.id === 'enter'));
    assert.deepEqual(game.getNearbyNpcs('gallery'), []);
    assert.equal(game.dispatch({type: 'go', target: 'hall', from: 'hall'}).success, false);
    game.state.player.permitted = true;
    assert.equal(game.getNearbyNpcs('gallery').length, 1);
    assert.equal(game.dispatch({type: 'go', target: 'hall'}).success, true);
});

test('departure footing permits high exits and enforces posture before story rules', () => {
    const game = createGame({title: 'A High Window', player: {room: 'yard'}, rooms: {
        yard: {name: 'Yard', exits: {street: {}, loft: {standingOn: 'crate'}}, items: {
            crate: {name: 'Crate', climbable: {climbed: false}},
            window: {name: 'Window', passage: {destination: 'loft'}},
        }}, street: {name: 'Street'}, loft: {name: 'Loft'},
    }});
    let attempts = 0;
    game.before('go', () => { attempts++; });
    assert.equal(game.dispatch({type: 'go', target: 'loft'}).success, false);
    game.dispatch({type: 'climb', target: 'crate'});
    assert.equal(game.dispatch({type: 'go', target: 'street'}).success, false);
    assert.equal(attempts, 0);
    assert.equal(game.dispatch({type: 'enter', target: 'window'}).success, true);
    assert.equal(game.state.player.currentRoom, 'loft');
    assert.equal(game.state.player.posture, undefined);
});

test('named exit text queries select variants without mutating state or depending on the viewed room', () => {
    const game = createGame({title: 'A Passage', player: {room: 'hall'}, rooms: {
        study: {name: 'Study', exits: {hall: {before: 'the closed ', variants: [{id: 'open', before: 'the open '}]}}},
        hall: {name: 'Hall'},
    }});
    game.available('exitVariant', {target: 'study', secondaryTarget: 'hall', when: ctx => ctx.action.option === 'open'},
        ctx => ctx.state.player.open === true);
    const exit = game.state.rooms.study.exits.hall;
    const saved = game.save();
    assert.equal(game.getExitDisplayDefinition(exit, 'Hall').before, 'the closed ');
    assert.deepEqual(game.save(), saved);
    game.state.player.open = true;
    assert.equal(game.getExitDisplayDefinition(exit, 'Hall').before, 'the open ');
    game.load(game.save());
    assert.equal(game.getExitDisplayDefinition(game.state.rooms.study.exits.hall, 'Hall').before, 'the open ');
});
