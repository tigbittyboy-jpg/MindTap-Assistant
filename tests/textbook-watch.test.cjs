const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../extension/textbook-watch.js'), 'utf8');
async function harness(enabled = true, error = false) {
  let interval, changed, calls = 0;
  let section = {title: 'Tubing', text: 'Copper tubing is used for refrigerant piping.'};
  const settings = enabled === null ? {} : {autoSaveTextbook: enabled};
  const context = vm.createContext({
    document: {visibilityState: 'visible'},
    globalThis: {mindtapAssistant: {textbook: () => section}},
    setInterval: callback => {interval = callback; return 1;}, clearInterval: () => {interval = undefined;},
    chrome: {storage: {local: {get: async () => settings, set: async values => Object.assign(settings, values)},
      onChanged: {addListener: callback => changed = callback}},
      runtime: {sendMessage: async () => {calls++; return error ? {error: 'Archive full'} : {message: 'Saved'};}}}
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  return {settings, get calls() {return calls;}, async tick() {if (interval) await interval();},
    replace(value) {section = value;}, toggle(value) {changed({autoSaveTextbook: {newValue: value}}, 'local');},
    hide() {context.document.visibilityState = 'hidden';}};
}
test('auto-save waits for stable text, skips repeats, and saves a newly opened section', async () => {
  const app = await harness();
  assert.equal(app.calls, 0);
  await app.tick(); assert.equal(app.calls, 1);
  await app.tick(); assert.equal(app.calls, 1);
  app.replace({title: 'Solder', text: 'Heat the metal, not the solder.'});
  await app.tick(); assert.equal(app.calls, 1);
  await app.tick(); assert.equal(app.calls, 2);
});
test('disabled or hidden readers do not save', async () => {
  const app = await harness(false); await app.tick(); assert.equal(app.calls, 0);
  app.toggle(true); app.hide(); await app.tick(); assert.equal(app.calls, 0);
  app.toggle(false); await app.tick(); assert.equal(app.calls, 0);
});
test('save errors switch automatic capture off instead of retrying forever', async () => {
  const app = await harness(true, true); await app.tick();
  assert.equal(app.calls, 1); assert.equal(app.settings.autoSaveTextbook, false);
  await app.tick(); assert.equal(app.calls, 1);
});

test('automatic saving defaults on without a stored preference', async () => {
  const app = await harness(null); await app.tick();
  assert.equal(app.calls, 1);
});
