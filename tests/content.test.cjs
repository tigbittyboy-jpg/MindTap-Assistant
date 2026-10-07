const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/content.js'), 'utf8');
function fixture(html) {
  const window = new JSDOM(html, {runScripts: 'outside-only'}).window;
  window.HTMLElement.prototype.getClientRects = function() { return this.hidden ? [] : [{}]; };
  window.eval(source);
  return window;
}
const choices = '<label><input type="radio" name="q">3</label><label><input type="radio" name="q">4</label>';
test('short prompt outside deeply nested answer controls', () => {
  const window = fixture('<section><p class="question-text">2 + 2?</p>' + '<div>'.repeat(9) + choices + '</div>'.repeat(9) + '</section><button>Next</button>');
  assert.equal(window.mindtapAssistant.read().prompt, '2 + 2?');
});
test('manual prompt fallback selects answer and rejects changed answer choices', () => {
  const window = fixture('<div>' + choices + '</div>');
  const helper = window.mindtapAssistant;
  assert.throws(() => helper.read(), /Paste the question/);
  const result = helper.read('2 + 2?');
  helper.apply(result.fingerprint, 1, '2 + 2?');
  assert.equal(window.document.querySelectorAll('input')[1].checked, true);
  window.document.querySelectorAll('label')[1].lastChild.textContent = '5';
  assert.throws(() => helper.apply(result.fingerprint, 1, '2 + 2?'), /Question changed/);
});
test('reinjection updates an older helper version', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset>');
  window.mindtapAssistant = {version: 1};
  window.eval(source);
  assert.equal(window.mindtapAssistant.version, 2);
  assert.equal(window.mindtapAssistant.read().prompt, '2 + 2?');
});
