const { JSDOM, VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();
vc.on('error', (e) => console.log('Error', e));
vc.on('jsdomError', (e) => console.log('JSDOMError', e));
const dom = new JSDOM(require('fs').readFileSync('index.html', 'utf8'), { runScripts: 'dangerously', url: 'http://localhost', virtualConsole: vc });
setTimeout(() => process.exit(0), 4000);
