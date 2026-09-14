import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(process.argv[2] || path.join(root,'release'));
await fs.mkdir(destination,{recursive:true});
const checksums=[];
for (const name of ['engine','browser']) {
    const output = JSON.parse(execFileSync('npm',['pack',`./packages/${name}`,'--json','--ignore-scripts','--pack-destination',destination],{cwd:root,encoding:'utf8',env:{...process.env,npm_config_cache:path.join(root,'node_modules/.npm-cache')}}));
    const archive=Object.values(output)[0];
    for (const file of archive.files) if (/^(?:tests|data|img|node_modules|\.migration)\//.test(file.path)) throw new Error(`Unexpected package file: ${file.path}`);
    const bytes=await fs.readFile(path.join(destination,archive.filename));
    checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${archive.filename}`);
    console.log(`${archive.filename}: ${archive.files.length} files, ${archive.size} bytes`);
}
await fs.writeFile(path.join(destination,'SHA256SUMS'),checksums.join('\n')+'\n');
