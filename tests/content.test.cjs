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
test('page prompt selects answer and rejects changed answer choices', () => {
  const missingPrompt = fixture('<div>' + choices + '</div>');
  assert.throws(() => missingPrompt.mindtapAssistant.read(), /Could not identify the question prompt/);
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset>');
  const helper = window.mindtapAssistant;
  const result = helper.read();
  helper.apply(result.fingerprint, 1);
  assert.equal(window.document.querySelectorAll('input')[1].checked, true);
  window.document.querySelectorAll('label')[1].lastChild.textContent = '5';
  assert.throws(() => helper.apply(result.fingerprint, 1), /Question changed/);
});
test('reinjection updates an older helper version', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset>');
  window.mindtapAssistant = {version: 1};
  window.eval(source);
  assert.equal(window.mindtapAssistant.version, 5);
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

test('handles descriptive aria labels, icon words, and nested role buttons', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset>' +
    '<button aria-label="Advance exercise" id="next"><span role="button">NEXT arrow_forward</span></button>');
  let clicked = 0;
  window.document.querySelector('#next').addEventListener('click', () => clicked++);
  window.mindtapAssistant.next(window.mindtapAssistant.read().fingerprint);
  assert.equal(clicked, 1);
});
test('ambiguous navigation refuses to click until user chooses a control', async () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset>' +
    '<button>Next</button><button id="exercise-next">Next</button>');
  const helper = window.mindtapAssistant;
  const fingerprint = helper.read().fingerprint;
  assert.throws(() => helper.next(fingerprint), /Found 2/);
  let clicks = 0;
  const button = window.document.querySelector('#exercise-next');
  button.addEventListener('click', () => clicks++);
  const selection = helper.chooseNext();
  button.click();
  await selection;
  assert.equal(clicks, 0);
  helper.next(fingerprint);
  assert.equal(clicks, 1);
  button.remove();
  // A removed selected control is never clicked again.
  assert.throws(() => helper.next(fingerprint), /no longer available/);
  assert.equal(clicks, 1);
});
