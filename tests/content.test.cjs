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
  assert.equal(window.mindtapAssistant.version, 3);
  assert.equal(window.mindtapAssistant.read().prompt, '2 + 2?');
});

test('preserves superscript units and recognizes an arrow beside Next', () => {
  const window = fixture('<fieldset><legend>Specific volume is 0.001865 ft<sup>3</sup>/lb. What is density?</legend>' +
    '<label><input type="radio" name="q">56.19 lb/ft<sup>3</sup></label>' +
    '<label><input type="radio" name="q">536.19 lb/ft<sup>3</sup></label></fieldset><button id="next">NEXT →</button>');
  const result = window.mindtapAssistant.read();
  assert.match(result.prompt, /ft\^\(3\)/);
  assert.equal(result.choices[1], '536.19 lb/ft^(3)');
  let clicked = false;
  window.document.querySelector('#next').addEventListener('click', () => clicked = true);
  window.mindtapAssistant.next(result.fingerprint);
  assert.equal(clicked, true);
});
