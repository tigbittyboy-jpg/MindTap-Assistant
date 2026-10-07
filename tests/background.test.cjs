const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
function harness({count = 30, selectionMismatch = false, answerMismatch = false} = {}) {
  let listener, cursor = 0, selected = -1, transitionalReads = 0;
  const session = {}, local = {}, requests = [], clicks = [];
  const data = () => ({prompt: `Question ${cursor}: 2 + 2?`, choices: ['3', '4'], fingerprint: `q${cursor}`});
  const storage = state => ({
    async get(key) { return structuredClone({[key]: state[key]}); },
    async set(values) { Object.assign(state, structuredClone(values)); }
  });
  const chrome = {
    storage: {local: storage(local), session: storage(session)},
    runtime: {id: 'test', onMessage: {addListener(fn) { listener = fn; }}},
    scripting: {async executeScript(request) {
      if (request.files) return [];
      const [operation, args] = request.args;
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
      if (operation === 'next') { clicks.push(cursor); cursor++; selected = -1; transitionalReads = 1; return [{result: {value: 'Next clicked'}}]; }
      throw Error('Unexpected operation');
    }}
  };
  const context = vm.createContext({chrome, crypto: {randomUUID: () => `entry-${requests.length}`},
    setTimeout: fn => queueMicrotask(fn), AbortSignal, Date,
    fetch: async (_url, request) => {
      const body = JSON.parse(request.body); requests.push(body);
      return {ok: true, json: async () => ({index: 1, answer_text: answerMismatch ? '3' : '4', confidence: .05,
        explanation: '2 + 2 = 4.', provider: 'ollama', model: 'test'})};
    }});
  vm.runInContext(source, context);
  return {session, local, requests, clicks,
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
