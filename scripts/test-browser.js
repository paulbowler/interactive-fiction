import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'))).version;
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'if-browser-test-'));
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',env:{...process.env,npm_config_cache:path.join(os.tmpdir(),'if-browser-test-cache')}});
let server,browser;
try {
    const artifacts=path.join(temporary,'release');await fs.mkdir(artifacts);
    run(process.execPath,[path.join(root,'scripts/pack-release.js'),artifacts],root);
    const project=path.join(temporary,'study');await fs.cp(path.join(root,'examples/study'),project,{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/dist')});
    const pkg=JSON.parse(await fs.readFile(path.join(project,'package.json')));
    for(const name of ['engine','browser'])pkg.dependencies[`@paulbowler/if-${name}`]=`file:../release/paulbowler-if-${name}-${version}.tgz`;
    await fs.writeFile(path.join(project,'package.json'),JSON.stringify(pkg));
    run('npm',['install','--ignore-scripts','--no-audit','--no-fund'],project);
    // A controller supplies a predicate for an authored image alternative.
    const storyFile=path.join(project,'src/story.js');
    const story=await fs.readFile(storyFile,'utf8');
    await fs.writeFile(storyFile,story.replace('export function register(game) {', `export function register(game) {
        game.available('image', {target:'study', when: ctx => ctx.action.option === 'duskIllustration'}, ctx => ctx.state.player.dusk === true);
        game.describe('study:mural', ctx => ctx.target.examined ? 'examined' : 'default');
        game.instead('give', {target:'parcel', secondaryTarget:'courier'}, ctx => {
            if (!game.transferToNpc('parcel','courier')) return 'STOP';
            ctx.say(ctx.secondaryTarget.prose.accepted);
            ctx.commit();
            return 'HANDLED';
        });
`));
    const worldFile=path.join(project,'data/game.json5');
    await fs.writeFile(worldFile,(await fs.readFile(worldFile,'utf8'))
        .replace("name: 'Wooden Box',", "name: 'Wooden Box', unlockLabel: 'Release box latch',")
        .replace('clock: {', "endings: [{id: 'too-late', title: 'Too late', text: ['Dawn arrives.']}], clock: { startTime: '23:58', deadline: {time: '00:30', ending: 'too-late'},")
        .replace("name: 'Study',", "name: 'Study', scenery:{mural:{name:'mural',title:'Mural',description:{default:'A faded mural.',examined:'A painted ship.'}}}, imageVariants: [{id:'duskIllustration', imageUrl:'./assets/study.svg', imagePosition:{x:'right',y:'bottom'}}],")
        .replace("items: {", "items: { jewels:{name:'Crown Jewels',article:'some',fixed:true}, elsie:{name:'Elsie',article:'none',npc:{talk:{message:'Hello.'}}}, firesideSet:{name:'fireside tools',article:'a set of',fixed:true,supporter:true}, courier:{name:'Courier', npc:{talk:{message:'Not now.'},give:{message:'No thanks.'}},prose:{accepted:'I will deliver it.'}}, parcel:{name:'Parcel',portable:true},")
        .replace('A wooden box rests beside a brass key.', 'A wooden box rests beside a brass key. A [[mural]] covers the wall.'));
    run('npm',['run','build'],project);
    const dist=path.join(project,'dist');
    server=http.createServer(async(request,response)=>{
        const url=new URL(request.url,'http://localhost');
        const filename=path.resolve(dist,'.'+decodeURIComponent(url.pathname.replace(/^\/demo/,''))+(url.pathname.endsWith('/')?'index.html':''));
        if(!url.pathname.startsWith('/demo/')||!filename.startsWith(dist+path.sep)){response.writeHead(404).end();return;}
        try {
            const body=await fs.readFile(filename);
            const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
            response.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'}).end(body);
        } catch {response.writeHead(404).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await webkit.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/demo/`);
    await page.locator('#start-game-button').click();
    assert.equal(await page.locator('#room-name').textContent(),'Study');
    assert.equal(await page.getByRole('button', {name: 'Elsie', exact: true}).count(), 1);
    const jewelsLink = page.getByRole('button', {name: 'Crown Jewels', exact: true});
    assert.equal(await jewelsLink.count(), 1);
    assert.ok(await jewelsLink.evaluate(button => button.previousSibling.textContent.endsWith('some ')));
    const firesideLink = page.getByRole('button', {name: 'fireside tools', exact: true});
    assert.equal(await firesideLink.count(), 1);
    assert.ok(await firesideLink.evaluate(button => button.previousSibling.textContent.endsWith('a set of ')));
    assert.equal(await page.locator('#game-clock').textContent(), '23:58');
    assert.equal(await page.locator('#game-clock').getAttribute('aria-label'), 'Time: 23:58');
    assert.equal(await page.locator('#room-image').evaluate(img=>img.style.objectPosition),'center center');
    await page.locator('#room-description').getByRole('button',{name:'mural',exact:true}).click();
    assert.ok((await page.locator('#messageModal').textContent()).includes('A painted ship.'));
    await page.locator('#messageModal .close').click();
    const action=async(region,item,label)=>{
        await page.locator(region).getByRole('button',{name:item,exact:true}).click();
        await page.locator('#item-actions').getByRole('button',{name:label,exact:true}).click();
        if(await page.locator('#messageModal').isVisible()) await page.locator('#messageModal .close').click();
    };
    await action('#items','Courier','Talk to');
    await action('#items','Parcel','Take');
    await page.locator('#player-gear-toggle').click();
    await action('#player-gear-items','Parcel','Give to Courier');
    await action('#items','Brass Key','Take');
    await page.locator('#player-gear-toggle').click();
    await action('#player-gear-items','Brass Key','Release box latch');
    // The browser closes the gear drawer after using an inventory item.
    await action('#items','Wooden Box','Open');
    await action('#items','Letter','Take Out');
    await page.locator('#wait-button').click();
    const state=()=>page.evaluate(async()=>{
        const {browserView}=await import(document.querySelector('script[type="module"]').src);
        return browserView.game.save();
    });
    const elapsedMinutes = (await state()).player.elapsedMinutes;
    const clockText = `${String(Math.floor(((1438 + elapsedMinutes) % 1440) / 60)).padStart(2, '0')}:${String((1438 + elapsedMinutes) % 60).padStart(2, '0')}`;
    assert.equal(await page.locator('#game-clock').textContent(), clockText);
    assert.ok((await state()).player.dusk);
    assert.equal((await state()).rooms.study.imageVariants[0].id,'duskIllustration');
    assert.equal(await page.locator('#room-image').evaluate(img=>img.style.objectPosition),'right bottom');
    assert.equal((await page.locator('#room-description').textContent()).trim(), 'Dusk gathers beyond the study window.');
    assert.ok((await state()).player.carried.letter);
    assert.ok((await state()).rooms.study.items.courier.properties.npc.inventory.parcel);
    assert.equal((await state()).rooms.study.scenery.mural.examined,true);
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    await page.reload();
    await page.locator('#room-name').getByText('Study',{exact:true}).waitFor();
    assert.equal(await page.locator('#game-clock').textContent(), clockText);
    assert.ok((await state()).player.carried.letter);
    assert.ok((await state()).rooms.study.items.courier.properties.npc.inventory.parcel);
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});server=null;
    await page.reload();
    await page.locator('#room-name').getByText('Study',{exact:true}).waitFor();
    assert.equal(await page.locator('#game-clock').textContent(), clockText);
    assert.ok((await state()).player.dusk);
    assert.equal((await state()).rooms.study.scenery.mural.examined,true);
    assert.equal((await state()).rooms.study.imageVariants[0].id,'duskIllustration');
    assert.equal(await page.locator('#room-image').evaluate(img=>img.style.objectPosition),'right bottom');
    assert.equal((await page.locator('#room-description').textContent()).trim(), 'Dusk gathers beyond the study window.');
    assert.ok(await page.locator('#room-image').evaluate(img=>img.complete&&img.naturalWidth>0));
    await page.locator('#game-menu-button').click();
    await page.locator('[data-save-slots]').click();
    await page.getByRole('button', {name: 'Save slot 1', exact: true}).click();
    assert.ok((await page.locator('[data-slot="1"] p').textContent()).includes(clockText));
    await page.locator('#saveSlotsModal .close').click();
    await page.evaluate(async () => {
        const {browserView} = await import(document.querySelector('script[type="module"]').src);
        for (let turn = 0; turn < 32 && !browserView.game.state.player.gameOver; turn++)
            browserView.game.dispatch({type: 'wait'});
    });
    assert.equal(await page.locator('#end-screen').isVisible(), true);
    assert.equal(await page.locator('#end-screen-title').textContent(), 'Too late');
    assert.equal(await page.locator('#end-screen-time').textContent(), 'Time: 00:30');
    assert.equal(await page.locator('#end-screen-time').getAttribute('aria-label'), 'Time: 00:30');
    await page.reload();
    await page.locator('#end-screen-title').getByText('Too late', {exact: true}).waitFor();
    assert.equal((await state()).player.ending, 'too-late');
    assert.deepEqual(errors,[]);
    console.log('PASS: Independent study uses packaged UI/actions, saves and reloads offline beneath /demo/.');
} finally {
    await browser?.close();
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    await fs.rm(temporary,{recursive:true,force:true});
}
