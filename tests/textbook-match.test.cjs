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
const statePrompt = 'The state of the refrigerant at the outlet of the condenser should be';
const stateChoices = ['100% superheated vapor.', '75% liquid and 25% vapor.', '100% subcooled liquid.', '50% liquid and 50% vapor.'];
test('compressor outlet passage cannot answer a condenser outlet question', () => {
  assert.equal(match(statePrompt, stateChoices,
    'The refrigerant at the outlet of the compressor does not follow a temperature/pressure relationship. This is because the refrigerant is 100% vapor and superheated.'), null);
});
test('reordered phase wording matches the correct component outlet', () => {
  const result = match(statePrompt, stateChoices,
    'The refrigerant at the outlet of the compressor is 100% vapor and superheated. At the outlet of the condenser, the refrigerant is 100% liquid and subcooled.');
  assert.equal(result.index, 2);
  assert.match(result.evidence, /outlet of the condenser/);
});
test('leaving wording and a following same-refrigerant sentence retain location', () => {
  const result = match(statePrompt, stateChoices,
    'The refrigerant is leaving the condenser. It is a sub-cooled liquid.');
  assert.equal(result.index, 2);
});
test('inlets, mixed phases, and negated phase statements stay separate', () => {
  assert.equal(match(statePrompt, stateChoices, 'At the inlet of the condenser, the refrigerant is 100% superheated vapor.'), null);
  assert.equal(match(statePrompt, stateChoices, 'At the outlet of the condenser, the refrigerant is not subcooled liquid.'), null);
  assert.equal(match(statePrompt, stateChoices, 'At the outlet of the condenser, 0% is subcooled liquid.'), null);
  assert.equal(match(statePrompt, stateChoices, 'At the outlet of the condenser, the refrigerant is 99% subcooled liquid.'), null);
  assert.equal(match(statePrompt, stateChoices, 'At the outlet of the condenser, the refrigerant is a 75 percent liquid mixture with 25 percent vapor and subcooled liquid.'), null);
});
test('retrieval includes the asked connection deep inside a saved section', () => {
  context.data = {prompt: statePrompt, choices: stateChoices};
  context.sections = [{title: 'The Condenser', text:
    'The outlet of the compressor contains superheated vapor refrigerant. '.repeat(70) +
    'At the outlet of the condenser, the refrigerant is 100% liquid and subcooled.'}];
  const references = vm.runInContext('findReferences(data, sections)', context);
  assert.ok(references.some(item => item.text.includes('outlet of the condenser')));
  context.references = references;
  const result = vm.runInContext('textbookTextMatch(data, references)', context);
  assert.equal(result.index, 2);
});
