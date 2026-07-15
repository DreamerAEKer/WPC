const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.split('<script>');
fs.writeFileSync('extracted2.js', scripts[scripts.length-1].split('</script>')[0]);
