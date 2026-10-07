const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
function harness({switchToTextbookOnFetch = false, assistanceMode = 'ai', cached = false, count = 30, selectionMismatch = false, answerMismatch = false, unchecked = false, disagreement = false, review = false, stopAtReview = false, missingFinish = false, textbookSections = [], bookTie = false, badQuote = false} = {}) {
  let listener, cursor = 0, selected = -1, transitionalReads = 0;
  const session = {}, local = {textbookSections, assistanceMode}, requests = [], clicks = [], finishes = [];
  const data = () => ({prompt: `Question ${cursor}: 2 + 2?`, choices: ['3', '4'], fingerprint: `q${cursor}`});
  const storage = state => ({
    async get(key) { return structuredClone({[key]: state[key]}); },
    async set(values) { Object.assign(state, structuredClone(values)); }
  });
  const chrome = {
    storage: {local: storage(local), session: storage(session)},
    runtime: {id: 'test', getURL: path => 'chrome-extension://test/' + path, onMessage: {addListener(fn) { listener = fn; }}},
    scripting: {async executeScript(request) {
      if (request.files) return [];
      const [operation, args] = request.args;
      if (operation === 'textbook') return [{result: {value: {title: 'Numbers', text: 'Question number choices: 2 plus 2 equals 4.'}}}];
      if (operation === 'read') {
        if (cursor >= count) return [{result: {error: 'Activity complete'}}];
        if (transitionalReads > 0) {
          transitionalReads--;
          return [{result: {value: {...data(), prompt: 'Loading old choices', fingerprint: 'transient'}}}];
        }
        return [{result: {value: data()}}];
      }
      if (operation === 'apply') { selected = selectionMismatch ? 0 : args[1]; return [{result: {value: 'selected'}}]; }
      if (operation === 'verify') {
        if (selected !== args[1]) return [{result: {error: 'The displayed selected answer does not match the suggestion.'}}];
        return [{result: {value: {index: selected, text: data().choices[selected]}}}];
      }
      if (operation === 'advance') {
        const kind = review && cursor === count - 1 ? 'review' : 'next';
        clicks.push(cursor); cursor++; selected = -1; transitionalReads = 1;
        if (kind === 'review' && stopAtReview) await new Promise(resolve => listener({action: 'stop'}, {id: 'test'}, resolve));
        return [{result: {value: {kind}}}];
      }
      if (operation === 'finishReview') {
        if (missingFinish) return [{result: {value: false}}];
        finishes.push(true); return [{result: {value: true}}];
      }
      throw Error('Unexpected operation');
    }}
  };
  const context = vm.createContext({chrome, crypto: {randomUUID: () => `entry-${requests.length}`},
    setTimeout: fn => queueMicrotask(fn), AbortSignal, Date, TextEncoder,
    fetch: async (_url, request) => {
      const body = JSON.parse(request.body); requests.push(body);
      if (switchToTextbookOnFetch) await new Promise(resolve => listener({action: 'setAssistanceMode', mode: 'textbook'}, {id: 'test'}, resolve));
      if (disagreement) return {ok: false, json: async () => ({error: 'Textbook reference could not support an answer. Review manually.'})};
      return {ok: true, json: async () => ({cached, textbook_resolved: bookTie, evidence_source_index: 0, evidence_source: 'Numbers', evidence_quote: badQuote ? 'Fabricated quote that is absent.' : 'Question number choices: 2 plus 2 equals 4.', reference_count: body.references.length, analysis_mode: unchecked ? undefined : 'single_pass', index: 1, answer_text: answerMismatch ? '3' : '4', confidence: .05,
        explanation: '2 + 2 = 4.', provider: 'ollama', model: 'test'})};
    }});
  vm.runInContext(source, context);
  return {session, local, requests, clicks, finishes,
    async command(request) { return new Promise(resolve => listener(request, {id: 'test'}, resolve)); },
    async detachedState() {
      return new Promise(resolve => listener({action: 'getAutomationState'}, {id: 'test', tab: {id: 99}, url: 'chrome-extension://test/popup.html?sourceWindow=7'}, resolve));
    },
    rejectedWebpage() {
      return listener({action: 'clearTextbook'}, {id: 'test', tab: {id: 1}, frameId: 0, url: 'https://example.test/popup.html'}, () => {throw Error('Must not reply');});
    },
    async clear() {
      return new Promise(resolve => listener({action: 'clearTextbook'}, {id: 'test'}, resolve));
    },
    async save() {
      return new Promise(resolve => listener({action: 'autoSaveTextbook'}, {id: 'test', tab: {id: 1}, frameId: 0, url: 'https://ebooks.cengage.com/reader/book'}, resolve));
    },
    async start() {
      const reply = await new Promise(resolve => listener({action: 'analyze', auto: true, tabId: 1}, {id: 'test'}, resolve));
      assert.equal(reply.message, 'Automatic mode started.');
      for (let tries = 0; tries < 100 && vm.runInContext('running', context); tries++) await new Promise(setImmediate);
      assert.equal(vm.runInContext('running', context), false, 'automation must terminate at the end of the simulated activity');
    }};
}
test('automation passes 25 questions at low confidence and logs actual selections', async () => {
  const app = harness(); await app.start();
  assert.equal(app.requests.length, 30);
  assert.equal(app.clicks.length, 30);
  assert.ok(app.requests.every(request => !request.prompt.includes('Loading')));
  assert.equal(app.session.runHistory.length, 30);
  assert.ok(app.session.runHistory.every(entry => entry.selectionVerified && entry.selectedText === '4'));
});
test('selection mismatch prevents advancement and is recorded for diagnosis', async () => {
  const app = harness({selectionMismatch: true}); await app.start();
  assert.equal(app.clicks.length, 0);
  assert.equal(app.session.runHistory[0].selectionVerified, false);
  assert.match(app.local.status, /does not match/);
});
test('answer text/index mismatch is rejected before selection or advancement', async () => {
  const app = harness({answerMismatch: true}); await app.start();
  assert.equal(app.clicks.length, 0);
  assert.match(app.session.runHistory[0].error, /disagree/);
});


test('unsupported textbook answer prevents selection and advancement', async () => {
  const app = harness({disagreement: true}); await app.start();
  assert.equal(app.clicks.length, 0);
  assert.match(app.local.status, /could not support/);
  assert.equal(app.session.runHistory[0].selectionVerified, undefined);
});
test('older double-check backend cannot trigger automatic selection', async () => {
  const app = harness({unchecked: true}); await app.start();
  assert.equal(app.clicks.length, 0);
  assert.match(app.local.status, /Restart the v0.5.5.4 backend/);
});

test('last answer opens Review and clicks Finish exactly once without reanalysis', async () => {
  const app = harness({count: 2, review: true}); await app.start();
  assert.equal(app.requests.length, 2);
  assert.equal(app.finishes.length, 1);
  assert.equal(app.session.runHistory[1].finishClicked, true);
  assert.match(app.local.status, /completed/);
  assert.equal(app.local.automationActive, false);
});
test('Stop on review prevents Finish', async () => {
  const app = harness({count: 1, review: true, stopAtReview: true}); await app.start();
  assert.equal(app.finishes.length, 0);
  assert.match(app.local.status, /stopped/);
});
test('missing Finish stops without analyzing review questions', async () => {
  const app = harness({count: 1, review: true, missingFinish: true}); await app.start();
  assert.equal(app.requests.length, 1);
  assert.equal(app.finishes.length, 0);
  assert.match(app.local.status, /Finish was not available/);
});


test('saved textbook excerpts are retrieved and supplied with question requests', async () => {
  const app = harness({count: 1});
  assert.match((await app.save()).message, /10 MB/);
  assert.equal(app.local.textbookSections.length, 1);
  assert.match((await app.save()).message, /Already saved/);
  assert.equal(app.local.textbookSections.length, 1);
  await app.start();
  assert.equal(app.requests[0].references.length, 1);
  assert.equal(app.requests[0].references[0].source, 'Numbers');
  assert.ok(app.requests[0].references[0].text.includes('equals 4'));
});
test('unrelated library passages are not sent to the model', async () => {
  const app = harness({count: 1, textbookSections: [{title: 'Brazing', text: 'Heat copper tubing near fittings.'}]});
  await app.start();
  assert.equal(app.requests[0].references.length, 0);
});

test('clearing deletes only textbook archive and disables auto-save', async () => {
  const app = harness({textbookSections: [{title: 'Tubing', text: 'Copper'}]});
  app.local.autoSaveTextbook = true;
  app.local.unrelatedSetting = 'preserve';
  app.session.runHistory = [{id: 'old'}];
  assert.match((await app.clear()).message, /cleared/);
  assert.equal(app.local.textbookSections.length, 0);
  assert.equal(app.local.autoSaveTextbook, false);
  assert.equal(app.local.unrelatedSetting, 'preserve');
  assert.equal(app.session.runHistory[0].id, 'old');
});
test('archive over 10 MB rejects new sections without deleting existing data', async () => {
  const existing = {title: 'Large archive', text: 'x'.repeat(10 * 1024 * 1024)};
  const app = harness({textbookSections: [existing]});
  assert.match((await app.save()).error, /10 MB limit/);
  assert.equal(app.local.textbookSections.length, 1);
  assert.equal(app.local.textbookSections[0].text, existing.text);
});
test('clearing runs after in-flight saves so the cleared archive stays empty', async () => {
  const app = harness();
  const save = app.save(); const clear = app.clear();
  await Promise.all([save, clear]);
  assert.equal(app.local.textbookSections.length, 0);
  assert.equal(app.local.autoSaveTextbook, false);
});

test('textbook-supported answer continues automatic selection and advancement', async () => {
  const app = harness({count: 1, bookTie: true, textbookSections: [{title: 'Numbers', text: 'Question number choices: 2 plus 2 equals 4.'}]});
  await app.start();
  assert.equal(app.clicks.length, 1);
  assert.equal(app.requests[0].references.length, 1);
  assert.equal(app.session.runHistory[0].selectionVerified, true);
});
test('nonverbatim quote metadata does not block a valid single AI answer', async () => {
  const app = harness({count: 1, bookTie: true, badQuote: true, textbookSections: [{title: 'Numbers', text: 'Question number choices: 2 plus 2 equals 4.'}]});
  await app.start();
  assert.equal(app.clicks.length, 1);
  assert.equal(app.session.runHistory[0].selectionVerified, true);
});

test('detached extension tab receives control replies while ordinary webpages remain blocked', async () => {
  const app = harness();
  assert.equal((await app.detachedState()).active, false);
  assert.equal(app.rejectedWebpage(), undefined);
});

test('cached answers keep selection verification and record reuse', async () => {
  const app = harness({cached: true, count: 1, review: true});
  await app.start();
  assert.equal(app.clicks.length, 1);
  assert.equal(app.session.runHistory[0].cached, true);
  assert.equal(app.session.runHistory[0].selectionVerified, true);
});

test('textbook-only lookup returns passages without model requests or selection', async () => {
  const app = harness({assistanceMode: 'textbook', textbookSections: [{title: 'Numbers', text: 'Question number choices: 2 plus 2 equals 4.'}]});
  const reply = await app.command({action: 'analyze', tabId: 1});
  assert.match(reply.message, /Textbook passages · no AI/);
  assert.match(reply.message, /Numbers/);
  assert.match(reply.message, /2 plus 2 equals 4/);
  assert.equal(app.requests.length, 0);
  assert.equal(app.clicks.length, 0);
  for (const request of [{action: 'analyze', auto: true}, {action: 'apply'}, {action: 'next'}]) {
    assert.match((await app.command({...request, tabId: 1})).error, /Choose answers and navigate manually/);
  }
  assert.equal(app.requests.length, 0);
});
test('empty or unrelated textbook archives provide help without requesting AI', async () => {
  for (const textbookSections of [[], [{title: 'Oranges', text: 'Fresh fruit grows on trees.'}]]) {
    const app = harness({assistanceMode: 'textbook', textbookSections});
    const reply = await app.command({action: 'analyze', tabId: 1});
    assert.match(reply.message, /No textbook sections|No matching saved passages/);
    assert.equal(app.requests.length, 0);
  }
});
test('mode changes are saved and invalidate previous AI suggestions', async () => {
  const app = harness();
  await app.command({action: 'analyze', tabId: 1});
  await app.command({action: 'setAssistanceMode', mode: 'textbook'});
  assert.equal(app.local.assistanceMode, 'textbook');
  assert.equal(app.local.automationActive, false);
  await app.command({action: 'setAssistanceMode', mode: 'ai'});
  assert.match((await app.command({action: 'apply', tabId: 1})).error, /Analyze this question first/);
  assert.equal(app.requests.length, 1);
  assert.match((await app.command({action: 'setAssistanceMode', mode: 'unknown'})).error, /Unknown assistance mode/);
  assert.equal(app.local.assistanceMode, 'ai');
});

test('switching to textbook mode during AI generation stops automatic selection', async () => {
  const app = harness({switchToTextbookOnFetch: true});
  await app.start();
  assert.equal(app.requests.length, 1);
  assert.equal(app.local.assistanceMode, 'textbook');
  assert.equal(app.local.automationActive, false);
  assert.equal(app.clicks.length, 0);
  assert.match(app.local.status, /AI suggestion discarded/);
});
