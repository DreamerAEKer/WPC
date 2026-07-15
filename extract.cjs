const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.split('<script>');
let mainScript = '';
for (let s of scripts) {
  if (s.includes('const store = {')) {
    mainScript = s.split('</script>')[0];
  }
}
fs.writeFileSync('extracted.js', mainScript);
