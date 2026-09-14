import fs from 'node:fs';
const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version;
if(process.env.RELEASE_TAG!==`v${version}`)throw new Error('Release tag must match the root package version');
for(const name of ['engine','browser']) {
    const pkg=JSON.parse(fs.readFileSync(new URL(`../packages/${name}/package.json`,import.meta.url)));
    if(pkg.version!==version)throw new Error(`${name} version does not match release tag`);
    if(pkg.license!=='MIT')throw new Error('Release license must be explicit');
}
const {ENGINE_VERSION}=await import('../packages/engine/index.js');
const {BROWSER_VERSION}=await import('../packages/browser/index.js');
if(ENGINE_VERSION!==version || BROWSER_VERSION!==version)throw new Error('Exported versions must match release');
console.log(`Verified v${version}`);
