import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const browserRoot = fileURLToPath(new URL('.', import.meta.url));
const engineName = '@paulbowler/if-engine';
const browserName = '@paulbowler/if-browser';
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const htmlEscape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

async function listFiles(dir, prefix = '') {
    const files = [];
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
        if (entry.name === '.DS_Store') continue;
        if (entry.isSymbolicLink()) throw new Error(`Build inputs must not contain symlinks: ${prefix}${entry.name}`);
        if (entry.isDirectory()) files.push(...await listFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`));
        else if (entry.isFile()) files.push(`${prefix}${entry.name}`);
    }
    return files;
}

export async function buildGame({ cwd = process.cwd(), configPath = 'if.config.json' } = {}) {
    cwd = await fs.realpath(cwd);
    const config = await json(path.resolve(cwd, configPath));
    const outputName = config.outDir || 'dist';
    if (!/^[a-zA-Z0-9_-]+$/.test(outputName) || ['src','data','assets','public','node_modules','vendor'].includes(outputName))
        throw new Error('outDir must be a separate child directory, normally dist');
    const output = path.join(cwd, outputName);
    const require = createRequire(path.join(cwd, 'package.json'));
    const engineRoot = path.dirname(require.resolve(`${engineName}/package.json`));
    const engine = await json(path.join(engineRoot, 'package.json'));
    const browser = await json(path.join(browserRoot, 'package.json'));
    if (!engine.version.startsWith('1.')) throw new Error(`Browser v1 requires engine v1, found ${engine.version}`);
    const input = async relative => {
        if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Build input must be a project-relative path');
        const file = path.resolve(cwd, relative);
        const real = await fs.realpath(file);
        if (!real.startsWith(cwd + path.sep) || real === output || real.startsWith(output + path.sep)) throw new Error('Build input escapes project or refers to output');
        if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Build input must not be a symlink');
        return file;
    };
    const entry = config.entry || 'src/main.js';
    if (!entry.startsWith('src/') || !entry.endsWith('.js')) throw new Error('entry must be a JavaScript file beneath src/');
    await input(entry);
    const worldPath = config.world || 'data/game.json';
    const world = await json(await input(worldPath));
    if (!world.title) throw new Error('Game world needs a title');
    const staging = await fs.mkdtemp(path.join(cwd, '.if-build-'));
    async function copy(from, relative) {
        const target = path.join(staging, relative);
        await fs.mkdir(path.dirname(target), {recursive:true});
        const stat = await fs.lstat(from);
        if (stat.isSymbolicLink()) throw new Error('Build inputs must not be symlinks');
        if (stat.isDirectory()) {
            for (const file of await listFiles(from)) await copy(path.join(from,file), `${relative}/${file}`);
        } else await fs.copyFile(from, target);
    }
    try {
        await copy(await input('src'), 'src');
        for (const relative of config.public || ['data', 'assets']) {
            if (!/^[a-zA-Z0-9_.-]+$/.test(relative) || ['src','vendor','node_modules',outputName,'index.html','service-worker.js','build-info.json'].includes(relative)) throw new Error(`Invalid public input: ${relative}`);
            await copy(await input(relative), relative);
        }
        await fs.access(path.join(staging, worldPath));
        for (const [root, name] of [[engineRoot,'engine'],[browserRoot,'browser']]) {
            for (const relative of ['index.js','src','LICENSE']) await copy(path.join(root,relative),`vendor/${name}/${relative}`);
        }
        await copy(config.styles ? await input(config.styles) : path.join(browserRoot,'assets/style.css'), 'style.css');
        let html = await fs.readFile(config.template ? await input(config.template) : path.join(browserRoot,'assets/index.html'), 'utf8');
        html = html.replaceAll('{{title}}', htmlEscape(world.title)).replaceAll('{{release}}', htmlEscape(config.release || world.version || '')).replaceAll('{{entry}}',htmlEscape(entry));
        const imports = JSON.stringify({imports:{[engineName]:'./vendor/engine/index.js',[browserName]:'./vendor/browser/index.js'}}).replaceAll('<','\\u003c');
        if (!html.includes('</head>')) throw new Error('HTML template needs a head element');
        if (html.includes('type="importmap"')) throw new Error('The build supplies the import map');
        html = html.replace('</head>', `    <script type="importmap">${imports}</script>\n</head>`);
        await fs.writeFile(path.join(staging,'index.html'),html);
        // Fail the build if a declared image will be missing offline.
        async function validateAssets(value) {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                if (key === 'imageUrl' && typeof child === 'string' && child) {
                    if (/^(?:[a-z]+:|\/)/i.test(child) || child.split('/').includes('..')) throw new Error(`Assets must be local project paths: ${child}`);
                    await fs.access(path.join(staging, child.split(/[?#]/)[0]));
                } else await validateAssets(child);
            }
        }
        await validateAssets(world);
        await fs.writeFile(path.join(staging,'build-info.json'),JSON.stringify({game:world.id || world.title,storyVersion:world.version,engine:engine.version,browser:browser.version},null,2)+'\n');
        const files = await listFiles(staging);
        const hash = createHash('sha256');
        for (const file of files) { hash.update(file); hash.update(await fs.readFile(path.join(staging,file))); }
        const revision = hash.digest('hex').slice(0,20);
        const urls = ['./', ...files.map(file => `./${file}`)];
        // Custom templates may retain versioned local script/style URLs.
        for (const match of html.matchAll(/(?:src|href)="([^"#]+\?[^\"]+)"/g)) {
            const url=match[1];
            if (/^(?:[a-z]+:|\/)/i.test(url) || url.split('/').includes('..')) throw new Error('Versioned resources must be local');
            await fs.access(path.join(staging,url.split('?')[0]));
            urls.push(url.startsWith('./') ? url : `./${url}`);
        }
        const worker = await fs.readFile(path.join(browserRoot,'assets/service-worker.js'),'utf8');
        await fs.writeFile(path.join(staging,'service-worker.js'),worker.replace('__REVISION__',revision).replace('__ASSETS__',JSON.stringify([...new Set(urls)])));
        // Only replace output previously produced by this builder (or empty).
        try {
            const contents = await fs.readdir(output);
            if (contents.length && !contents.includes('build-info.json')) throw new Error('Refusing to replace an unrecognized output directory');
            await fs.rm(output,{recursive:true});
        } catch(error) { if (error.code !== 'ENOENT') throw error; }
        await fs.rename(staging,output);
        return {directory:output,revision,files:urls.length,engine:engine.version,browser:browser.version};
    } finally { await fs.rm(staging,{recursive:true,force:true}); }
}
