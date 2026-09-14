#!/usr/bin/env node
import { buildGame } from '../build.js';
try {
    const result = await buildGame({ configPath: process.argv[2] || 'if.config.json' });
    console.log(`Built ${result.directory} (${result.revision}; engine ${result.engine}, browser ${result.browser})`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
