// Validate a question-set file before it goes live. Usage: node check.js <file.js>
// Exit 0 = OK. Used by the USB update scripts, so keep it ES5 / dependency-free.
var path = require('path');
var file = path.resolve(process.argv[2] || '');
var bank;
try { bank = require(file); } catch (e) { console.log('FAIL: cannot load ' + file + ' - ' + e.message); process.exit(1); }
var need = ['flipper', 'pit', 'spinner1', 'spinner2', 'spinner3', 'mega'];
var errors = [], total = 0;
need.forEach(function (k) {
  var list = bank[k];
  if (!Array.isArray(list) || list.length < 4) { errors.push(k + ': needs at least 4 questions'); return; }
  list.forEach(function (q, i) {
    var at = k + '[' + i + ']';
    if (!q || typeof q.q !== 'string' || !q.q) errors.push(at + ': missing question text');
    if (!Array.isArray(q.o) || q.o.length < 2) errors.push(at + ': needs 2+ options');
    else {
      if (q.o.some(function (x) { return typeof x !== 'string' || !x; })) errors.push(at + ': empty option');
      if (q.o.filter(function (x, j) { return q.o.indexOf(x) !== j; }).length) errors.push(at + ': duplicate options');
      if (typeof q.a !== 'number' || q.a < 0 || q.a >= q.o.length) errors.push(at + ': answer index out of range');
    }
    if (typeof q.e !== 'string' || !q.e) errors.push(at + ': missing explanation');
    total++;
  });
});
if (errors.length) { console.log('FAIL:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('OK: ' + total + ' questions (' + need.map(function (k) { return k + ' ' + bank[k].length; }).join(', ') + ')');
console.log('First flipper question: "' + bank.flipper[0].q + '"');
