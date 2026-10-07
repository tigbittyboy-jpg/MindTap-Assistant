const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/background.js'), 'utf8');
const context = vm.createContext({importScripts() {}, chrome: {runtime: {onMessage: {addListener() {}}}}});
vm.runInContext(source, context);
function match(prompt, choices, text) {
  context.data = {prompt, choices};
  context.references = [{source: 'Refrigerants', text}];
  return vm.runInContext('textbookTextMatch(data, references)', context);
}
test('one relevant choice produces a possible match and verbatim source sentence', () => {
  const result = match('Which refrigerant replaces R-410A in residential heat pumps?', ['HFO-1234yf', 'HFC R-32'],
    'R-32 replaces R-410A in residential heat pumps.');
  assert.equal(result.index, 1);
  assert.equal(result.evidence, 'R-32 replaces R-410A in residential heat pumps.');
  assert.equal(result.source, 'Refrigerants');
});
test('multiple choice mentions and negated evidence do not produce an answer', () => {
  assert.equal(match('Which refrigerant replaces R-410A in residential heat pumps?', ['R-32', 'R-454B'],
    'R-32 replaces R-410A in residential heat pumps. R-454B replaces R-410A in residential heat pumps.'), null);
  assert.equal(match('Which refrigerant replaces R-410A in residential heat pumps?', ['R-32', 'R-454B'],
    'R-32 does not replace R-410A in residential heat pumps.'), null);
});
test('unrelated mentions, partial word matches, and unsupported forms remain passage-only', () => {
  assert.equal(match('Which refrigerant replaces R-410A in residential heat pumps?', ['R-32', 'R-454B'], 'R-32 has a familiar name.'), null);
  assert.equal(match('Which refrigerant replaces R-410A in residential heat pumps?', ['R-32', 'R-454B'], 'R-320 replaces R-410A in residential heat pumps.'), null);
  assert.equal(match('Which refrigerant does NOT replace R-410A?', ['R-32', 'R-454B'], 'R-32 replaces R-410A.'), null);
  assert.equal(match('Residential heat pumps use R-32?', ['True', 'False'], 'True: residential heat pumps use R-32.'), null);
  assert.equal(match('What is 2 plus 2?', ['3', '4'], '2 plus 2 equals 4.'), null);
});
