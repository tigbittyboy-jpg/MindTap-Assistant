const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const table = JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/data/r410a-pt.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subcooling.json'), 'utf8'));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/hvac-calculator.js'), 'utf8'), context);
for (const fixture of cases) test('browser subcooling: ' + fixture.name, () => {
  const selectedTable = /R-22\b/.test(fixture.prompt) ? JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/data/r22-pt.json'), 'utf8')) : table;
  const question = {prompt: fixture.prompt, choices: fixture.choices};
  if (fixture.error) return assert.throws(() => context.hvacCalculator.calculateSubcooling(question, selectedTable), new RegExp(fixture.error));
  const answer = context.hvacCalculator.calculateSubcooling(question, selectedTable);
  if (fixture.null) return assert.equal(answer, null);
  assert.equal(answer.answer_text, fixture.answer);
  assert.equal(answer.index, fixture.choices.indexOf(fixture.answer));
  assert.equal(answer.calculated, true);
  assert.match(answer.explanation, new RegExp(fixture.reason_pattern || '119.6.*108.*11.6'));
});
test('bundled table uses ascending bubble-point psig values and expected span', () => {
  assert.equal(table.points.length, 181);
  assert.equal(table.points[0][1], -40);
  assert.equal(table.points.at(-1)[1], 140);
  assert.match(table.phase, /bubble/);
  for (let i=1;i<table.points.length;i++) assert.ok(table.points[i][0] > table.points[i-1][0]);
});

test('wrong refrigerant table rejected', () => { assert.throws(() => context.hvacCalculator.calculateHVAC({prompt: 'R-22 evaporator pressure is 76 psig and outlet temperature is 58°F. What is superheat?', choices: ['13°F']}, table), /table is invalid/); });
