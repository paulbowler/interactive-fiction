// Lock the public archive URLs using the exact locally tested release bytes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'if-example-lock-'));
try {
    const file=path.join(root,'examples/study/package.json');
    const original=JSON.parse(await fs.readFile(file));
    const version=JSON.parse(await fs.readFile(path.join(root,'package.json'))).version;
    const local=structuredClone(original);
    for(const name of ['engine','browser'])local.dependencies[`@paulbowler/if-${name}`]=`file:${path.join(root,`release/paulbowler-if-${name}-${version}.tgz`)}`;
    await fs.writeFile(path.join(directory,'package.json'),JSON.stringify(local));
    execFileSync('npm',['install','--package-lock-only','--ignore-scripts','--offline','--no-audit','--cache',path.join(os.tmpdir(),'if-example-lock-cache')],{cwd:directory,stdio:'pipe'});
    const lock=JSON.parse(await fs.readFile(path.join(directory,'package-lock.json')));
    lock.packages[''].dependencies=original.dependencies;
    for(const name of ['engine','browser'])lock.packages[`node_modules/@paulbowler/if-${name}`].resolved=original.dependencies[`@paulbowler/if-${name}`];
    await fs.writeFile(path.join(root,'examples/study/package-lock.json'),JSON.stringify(lock,null,2)+'\n');
} finally {await fs.rm(directory,{recursive:true,force:true});}
