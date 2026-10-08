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
test('retrieval excludes compressor outlet even under a condenser section title', () => {
  context.data = {prompt: statePrompt, choices: stateChoices};
  context.sections = [{title:'The Condenser',text:'The refrigerant at the outlet of the compressor is 100% vapor and superheated.'}];
  assert.equal(vm.runInContext('findReferences(data, sections).length', context),0);
});
test('focused references omit following descriptions of another component', () => {
  context.data = {prompt: statePrompt, choices: stateChoices};
  context.sections = [{title:'The Condenser',text:'The refrigerant at the outlet of the condenser is 100% liquid and subcooled. The refrigerant at the outlet of the compressor is superheated vapor.'}];
  const refs=vm.runInContext('findReferences(data, sections)',context);
  assert.equal(refs.length,1);
  assert.ok(!refs[0].text.includes('compressor'));
  context.references=refs;
  assert.equal(vm.runInContext('textbookTextMatch(data,references).index',context),2);
});
test('generic shared words and section titles cannot establish passage relevance', () => {
  context.data={prompt:'Which refrigerant replaces R-410A in residential heat pumps?',choices:['R-32','R-454B']};
  context.sections=[{title:'R-410A residential heat pumps',text:'This is the refrigerant which should be used.'}];
  assert.equal(vm.runInContext('findReferences(data,sections).length',context),0);
});
test('provided subcooling definition answers the normal condenser outlet state', () => {
  const text='The amount of subcooling in the condenser is the difference between the temperature of the refrigerant at the outlet of the condenser and the temperature at which the refrigerant condenses. Referring to Figure 3.28, it can be seen that the refrigerant condenses at and leaves the condenser at a temperature of. This means that this condenser is operating with of subcooling.';
  const answer=match(statePrompt,stateChoices,text);
  assert.equal(answer.index,2);
  assert.match(answer.reason,/Subcooling means cooling liquid/);
  assert.ok(text.includes(answer.evidence));
});
test('subcooling rule requires matching connection and normal state wording', () => {
  assert.equal(match(statePrompt,stateChoices,'The condenser has subcooling, calculated as a temperature difference. The compressor outlet is hot.'),null);
  assert.equal(match(statePrompt.replace('should be','currently is'),stateChoices,'The subcooling at the outlet of the condenser is calculated as a difference between saturation and liquid temperatures.'),null);
  assert.equal(match(statePrompt,stateChoices,'At the outlet of the condenser there is no subcooling compared with saturation.'),null);
  assert.equal(match(statePrompt,stateChoices,'At the outlet of the condenser there is 0°F of subcooling compared with saturation.'),null);
});
const comparisonPrompt='Which of the following statements is true with regards to reciprocating and rotary compressors?';
const comparisonChoices=[
 'Both rotary and reciprocating compressors are equipped with suction and discharge valves.',
 'For compressors with similar capacities, rotary compressors are smaller than reciprocating compressors.',
 'Both rotary and reciprocating compressors can be opened for service.',
 'Rotary and reciprocating compressors with similar capacities are similarly sized.'];
const comparisonPassage='Rotary compressors are typically used for applications in the small equipment range, such as window air conditioners, household refrigerators, and some residential air-conditioning systems. These compressors are desirable for these applications because they are usually physically smaller than reciprocating compressors of the same capacity. Rotary compressors are extremely efficient and have few moving parts.';
test('actual compressor passage supports the second choice through nearby subject context',()=>{
 const result=match(comparisonPrompt,comparisonChoices,comparisonPassage);
 assert.equal(result.index,1);
 assert.equal(result.method,'comparison');
 assert.match(result.evidence,/These compressors/);
 assert.match(result.reason,/same capacity/);
});
test('comparison preserves subject, direction, and capacity qualifications',()=>{
 assert.equal(match(comparisonPrompt,comparisonChoices,'Reciprocating compressors are smaller than rotary compressors of the same capacity.'),null);
 assert.equal(match(comparisonPrompt,comparisonChoices,'Rotary compressors are larger than reciprocating compressors of the same capacity.'),null);
 assert.equal(match(comparisonPrompt,comparisonChoices,'Rotary compressors are smaller than reciprocating compressors of different capacities.'),null);
 assert.equal(match(comparisonPrompt,comparisonChoices,'Rotary compressors are not smaller than reciprocating compressors of the same capacity.'),null);
 assert.equal(match(comparisonPrompt,comparisonChoices,'Rotary compressors and reciprocating compressors are common. These compressors are smaller than reciprocating compressors of the same capacity.'),null);
});
test('short named entries rank above introductions and other refrigerants', () => {
 context.data={prompt:'The color-coding for an R-22 refrigerant cylinder is',choices:['brown.','white.','orange.','green.']};
 context.sections=[{title:'Refrigerant Cylinder Color Codes',text:'Each refrigerant cylinder has a designated color.\n\nR-12: White.\n\nR-22: Green.'}];
 const refs=vm.runInContext('findReferences(data, sections)',context);
 assert.equal(refs[0].text,'R-22: Green.');
 context.references=refs;
 assert.equal(vm.runInContext('textbookTextMatch(data,references)',context).index,3);
 assert.ok(!refs.some(r=>r.text.includes('R-12')));
});
