const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/content.js'), 'utf8');
function fixture(html, url = 'https://example.test') {
  const window = new JSDOM(html, {runScripts: 'outside-only', url}).window;
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
  assert.equal(window.mindtapAssistant.version, 14);
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


test('verified last answer advances through Review and finishes once question controls disappear', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset><button id="review">REVIEW ☑</button>');
  const helper = window.mindtapAssistant;
  const data = helper.read();
  assert.throws(() => helper.advance(data.fingerprint), /Select and verify/);
  helper.apply(data.fingerprint, 1);
  window.document.querySelector('#review').onclick = () => {
    window.document.body.innerHTML = '<h2>Review</h2><button id="finish">FINISH</button>';
  };
  assert.equal(helper.advance(data.fingerprint).kind, 'review');
  let clicks = 0;
  window.document.querySelector('#finish').onclick = () => { clicks++; window.document.querySelector('#finish').remove(); };
  assert.equal(helper.finishReview(), true);
  assert.equal(helper.finishReview(), false);
  assert.equal(clicks, 1);
});
test('Finish refuses a question page, disabled controls, and ambiguous buttons', () => {
  const window = fixture('<fieldset><legend>2 + 2?</legend>' + choices + '</fieldset><button>Finish</button>');
  assert.equal(window.mindtapAssistant.finishReview(), false);
  window.document.body.innerHTML = '<button disabled>Finish</button>';
  assert.equal(window.mindtapAssistant.finishReview(), false);
  window.document.body.innerHTML = '<button>Finish</button><button>Finish</button>';
  assert.throws(() => window.mindtapAssistant.finishReview(), /multiple Finish/);
});


test('saves Cengage textbook paragraphs without sidebar or hidden text', () => {
  const window = fixture('<aside>Unrelated table of contents</aside><main><h2>Heating and Applying Solder</h2>' +
    '<p data-cgi="FSAYRC685VDCB0300999">Do <i>not</i> melt solder with the flame; use the heat in the metal.</p>' +
    '<p data-cgi="hidden" style="display:none">Hidden duplicate</p></main>', 'https://ebooks.cengage.com/reader/book');
  const section = window.mindtapAssistant.textbook();
  assert.equal(section.title, 'Heating and Applying Solder');
  assert.equal(section.text, 'Do not melt solder with the flame; use the heat in the metal.');
});
test('textbook capture refuses unrelated sites and sections without paragraphs', () => {
  assert.throws(() => fixture('<p data-cgi="x">Text</p>').mindtapAssistant.textbook(), /Cengage textbook/);
  const window = fixture('<main>Loading</main>', 'https://ebooks.cengage.com/reader/book');
  assert.throws(() => window.mindtapAssistant.textbook(), /No readable/);
});


test('captures textbook text from the Cengage reader frame, excluding the shell and hidden text', () => {
  const window = fixture('<aside><p data-cgi="sidebar">Sidebar noise</p></aside>' +
    '<div id="reading-section"><iframe id="iframe-page"></iframe></div>', 'https://ebooks.cengage.com/reader/book');
  const frame = window.document.querySelector('#iframe-page');
  const bookWindow = frame.contentWindow;
  bookWindow.HTMLElement.prototype.getClientRects = function() { return this.hidden ? [] : [{}]; };
  frame.contentDocument.body.innerHTML = '<section><header><h1>7.2. Types and Sizes of Tubing</h1></header>' +
    '<p data-cgi="first">Copper tubing is generally used for plumbing, heating, and refrigerant piping.</p>' +
    '<p data-cgi="second">Soft copper tubing may be bent.</p>' +
    '<p data-cgi="hidden" style="display:none">Hidden duplicate</p></section>';
  const data = window.mindtapAssistant.textbook();
  assert.equal(data.title, '7.2. Types and Sizes of Tubing');
  assert.equal(data.text, 'Copper tubing is generally used for plumbing, heating, and refrigerant piping.\n\nSoft copper tubing may be bent.');
  assert.ok(!data.text.includes('Sidebar'));
});
test('an empty reader frame does not fall back to unrelated shell paragraphs', () => {
  const window = fixture('<p data-cgi="shell">Shell text</p><iframe id="iframe-page"></iframe>', 'https://ebooks.cengage.com/reader/book');
  assert.throws(() => window.mindtapAssistant.textbook(), /No readable textbook paragraphs/);
});
test('textbook capture keeps list and table facts without nested duplicates', () => {
 const window = fixture('<aside><ul><li>Sidebar noise</li></ul></aside><h2>Cylinder Color Codes</h2><p data-cgi="intro">Cylinder colors:</p><ul><li><p data-cgi="entry">R-22: Green.</p></li><li style="display:none">Hidden fact</li></ul><table><tr><td>R-12</td><td>White</td></tr></table>', 'https://ebooks.cengage.com/reader/book');
 assert.equal(window.mindtapAssistant.textbook().text,'Cylinder colors:\n\nR-22: Green.\n\nR-12 — White');
});
