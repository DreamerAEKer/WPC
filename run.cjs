const { JSDOM, VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();
vc.on('error', (err) => { console.error('Browser Error:', err.message, err.stack); });
vc.on('jsdomError', (err) => { console.error('JSDOM Error:', err.message, err.stack); });
const dom = new JSDOM(require('fs').readFileSync('index.html', 'utf8'), { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc });
setTimeout(() => process.exit(0), 1000);
