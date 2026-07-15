const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.split('\\`').join('`');
html = html.split('\\$').join('$');
fs.writeFileSync('index.html', html);
