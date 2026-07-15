const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script>((?:[^<]|<(?!\\/script>))*)<\\/script>/gi)];
scripts.forEach((s, idx) => {
  try {
    require('vm').compileFunction(s[1]);
    console.log('Script ' + idx + ' is OK');
  } catch(e) {
    console.log('Script ' + idx + ' Syntax Error:', e.message);
  }
});
