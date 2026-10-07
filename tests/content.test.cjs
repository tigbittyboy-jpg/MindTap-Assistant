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
  assert.equal(window.mindtapAssistant.version, 10);
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

test('does not remove answer words or numbers from the question', () => {
  const window = fixture('<section><p>Which number equals 4?</p><div>' + choices + '</div></section>');
  assert.equal(window.mindtapAssistant.read().prompt, 'Which number equals 4?');
});
test('ignores hidden explanation text when reading labels and prompts', () => {
  const window = fixture('<section><p>Which number equals 4?</p><p style="display:none">Incorrect: answer is 99.</p>' +
    '<div><label><input type="radio" name="q">3<span hidden>correct</span></label><label><input type="radio" name="q">4</label></div></section>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.prompt, 'Which number equals 4?');
  assert.equal(data.choices.join(','), '3,4');
});
test('deduplicates role wrappers and verifies the currently selected answer', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend><div role="radio"><label><input type="radio" name="q">3</label></div><div role="radio"><label><input type="radio" name="q">4</label></div></fieldset>');
  const helper = window.mindtapAssistant;
  const data = helper.read();
  assert.equal(data.choices.length, 2);
  helper.apply(data.fingerprint, 1);
  assert.equal(helper.verify(data.fingerprint, 1).text, '4');
  window.document.querySelector('input').click();
  assert.throws(() => helper.verify(data.fingerprint, 1), /does not match/);
});


test('reads sibling answer text outside empty labels and icon wrappers', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' +
    '<div><span><input id="a" type="radio" name="q" aria-label="Select answer"></span><label for="a"></label><div>3</div></div>' +
    '<div><span><input id="b" type="radio" name="q" aria-label="Select answer"></span><label for="b"></label><div>4</div></div></fieldset>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.choices.join(','), '3,4');
  assert.equal(data.prompt, '2 + 2?');
  window.mindtapAssistant.apply(data.fingerprint, 1);
  assert.equal(window.mindtapAssistant.verify(data.fingerprint, 1).text, '4');
});

test('ignores a shared aria question label when reading individual answer rows', () => {
  const window = fixture('<fieldset><legend id="question">2 + 2?</legend>' +
    '<div><input type="radio" name="q" aria-labelledby="question"><span>3</span></div>' +
    '<div><input type="radio" name="q" aria-labelledby="question"><span>4</span></div></fieldset>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.choices.join(','), '3,4');
  assert.equal(data.prompt, '2 + 2?');
});

test('refuses unreadable or duplicate choices without using the shared question container', () => {
  for (const answers of ['<input type="radio" name="q"><input type="radio" name="q">',
    '<div><input type="radio" name="q">Same</div><div><input type="radio" name="q">Same</div>']) {
    const window = fixture('<fieldset><legend>2 + 2?</legend>' + answers + '</fieldset>');
    assert.throws(() => window.mindtapAssistant.read(), /distinct answer labels/);
  }
});


test('reads answer row text beyond repeated select labels', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' +
    '<div><label><input type="radio" name="q">Select answer</label><span>3</span></div>' +
    '<div><label><input type="radio" name="q">Select answer</label><span>4</span></div></fieldset>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.choices.join(','), 'Select answer 3,Select answer 4');
  assert.equal(data.prompt, '2 + 2?');
});

test('counts nested custom radio wrappers as one answer control', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' +
    '<div role="radio"><span role="radio" aria-label="3"></span></div>' +
    '<div role="radio"><span role="radio" aria-label="4"></span></div></fieldset>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.choices.join(','), '3,4');
});


test('reads Learnosity displayed aria-hidden answers without duplicate accessible copies', () => {
  const window = fixture('<fieldset><legend>Which description defines matter?</legend>' +
    '<div><input type="radio" name="q"><div class="lrn-possible-answer" aria-hidden="true">' +
    '<div class="lrn_contentWrapper" aria-hidden="true">exists only as a liquid or solid and has mass</div>' +
    '<div class="sr-only" aria-hidden="true">exists only as a liquid or solid and has mass</div></div></div>' +
    '<div><input type="radio" name="q"><div class="lrn-possible-answer" aria-hidden="true">' +
    '<div class="lrn_contentWrapper" aria-hidden="true">has mass and occupies space</div>' +
    '<div class="sr-only" aria-hidden="true">has mass and occupies space</div></div></div></fieldset>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.choices.join('|'), 'exists only as a liquid or solid and has mass|has mass and occupies space');
  assert.equal(data.prompt, 'Which description defines matter?');
  window.mindtapAssistant.apply(data.fingerprint, 1);
  assert.equal(window.mindtapAssistant.verify(data.fingerprint, 1).text, 'has mass and occupies space');
});

test('continues to exclude unrelated aria-hidden text and visually hidden Learnosity answers', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' +
    '<div><input type="radio" name="q"><div class="lrn-possible-answer" aria-hidden="true">3</div>' +
    '<span aria-hidden="true">Incorrect feedback</span></div>' +
    '<div><input type="radio" name="q"><div class="lrn-possible-answer" aria-hidden="true">4' +
    '<span style="display:none">hidden explanation</span></div></div></fieldset>');
  assert.equal(window.mindtapAssistant.read().choices.join(','), '3,4');
});


test('resolves Learnosity screen-reader references to separate visible answer copies', () => {
  const window = fixture('<section><p class="question-text">Which description defines matter?</p>' +
    '<div role="radiogroup"><input type="radio" name="q" aria-labelledby="answer-a">' +
    '<input type="radio" name="q" aria-labelledby="answer-b"></div>' +
    '<div class="lrn-possible-answer" aria-hidden="true"><div class="lrn_contentWrapper" aria-hidden="true">has mass</div>' +
    '<div id="answer-a" class="sr-only" aria-hidden="true">has mass</div></div>' +
    '<div class="lrn-possible-answer" aria-hidden="true"><div class="lrn_contentWrapper" aria-hidden="true">has no mass</div>' +
    '<div id="answer-b" class="sr-only" aria-hidden="true">has no mass</div></div></section>');
  const data = window.mindtapAssistant.read();
  assert.equal(data.choices.join(','), 'has mass,has no mass');
  assert.equal(data.prompt, 'Which description defines matter?');
});

test('reads visible Learnosity answer copies inside aria-hidden row wrappers', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' +
    '<div aria-hidden="true"><input type="radio" name="q"><div class="lrn-possible-answer" aria-hidden="true">3</div></div>' +
    '<div aria-hidden="true"><input type="radio" name="q"><div class="lrn-possible-answer" aria-hidden="true">4</div></div></fieldset>');
  assert.equal(window.mindtapAssistant.read().choices.join(','), '3,4');
});
