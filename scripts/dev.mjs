import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch', '--import', 'tsx', 'scripts/dev-api.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
children.forEach(child => child.on('exit', code => stop(code ?? 1)));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
