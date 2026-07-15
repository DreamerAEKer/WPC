const { JSDOM } = require('jsdom');
const dom = new JSDOM(require('fs').readFileSync('index.html', 'utf8'), { runScripts: 'dangerously', url: 'http://localhost/' });
setTimeout(() => {
  console.log("Rows inside p-a4-tbody:", dom.window.document.getElementById('p-a4-tbody').children.length);
  console.log("InnerHTML:", dom.window.document.getElementById('p-a4-tbody').innerHTML.substring(0, 100));
  process.exit(0);
}, 1000);
