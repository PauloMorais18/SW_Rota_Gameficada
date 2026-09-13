// Public demo shortcuts are requested for both localhost and the hosted demo.
// Set ALLOW_DEMO_LOGIN=false to disable them when switching to real operation.
export function demoEnabled() { return process.env.ALLOW_DEMO_LOGIN !== 'false'; }
