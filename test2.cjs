const vm = require('vm');
const fs = require('fs');
const code = fs.readFileSync('extracted2.js', 'utf8');
try {
  new vm.Script(code);
  console.log('No syntax error');
} catch (e) {
  console.log(e);
}
