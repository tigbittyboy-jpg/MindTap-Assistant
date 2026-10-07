let running = false;
let stopped = false;
const suggestions = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function report(message) { await chrome.storage.local.set({status: message}); return {message}; }
async function page(tabId, operation, args = []) {
  await chrome.scripting.executeScript({target: {tabId}, files: ['content.js']});
  const results = await chrome.scripting.executeScript({target: {tabId}, func: async (op, params) => {
    try { return {value: await globalThis.mindtapAssistant[op](...params)}; }
    catch (error) { return {error: error.message}; }
  }, args: [operation, args]});
  if (!results[0]?.result) throw Error('Could not access this page. Embedded frames are not supported yet.');
  if (results[0].result.error) throw Error(results[0].result.error);
  return results[0].result.value;
}
async function analyze(tabId) {
  suggestions.delete(tabId);
  const data = await page(tabId, 'read');
  await report('Analyzing question…');
  const response = await fetch('http://127.0.0.1:8765/analyze', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({prompt: data.prompt, choices: data.choices}), signal: AbortSignal.timeout(105000)
  });
  const answer = await response.json();
  if (!response.ok) throw Error(answer.error || 'Backend request failed.');
  if (!Number.isInteger(answer.index) || answer.index < 0 || answer.index >= data.choices.length ||
      !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1 || typeof answer.explanation !== 'string') throw Error('Invalid AI response.');
  const suggestion = {...answer, fingerprint: data.fingerprint};
  suggestions.set(tabId, suggestion);
  await report(`Suggestion: ${data.choices[answer.index]}\nConfidence (AI estimate): ${Math.round(answer.confidence * 100)}%\n${answer.explanation}`);
  return suggestion;
}
async function automate(tabId) {
  running = true; stopped = false;
  try {
    while (!stopped) {
      const answer = await analyze(tabId);
      if (stopped) break;
      await page(tabId, 'apply', [answer.fingerprint, answer.index]);
      await delay(750);
      if (stopped) break;
      await page(tabId, 'next', [answer.fingerprint]);
      suggestions.delete(tabId);
      let changed = false;
      for (let attempt = 0; attempt < 20 && !stopped; attempt++) {
        await delay(500);
        try { changed = (await page(tabId, 'read')).fingerprint !== answer.fingerprint; } catch { continue; }
        if (changed) break;
      }
      if (!changed && !stopped) throw Error('Automatic mode stopped: next question did not appear.');
    }
    await report('Automatic mode stopped.');
  } catch (error) { await report(error.message); }
  finally { running = false; }
}
chrome.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return;
  (async () => {
    if (request.action === 'stop') { stopped = true; return report('Stop requested.'); }
    if (running) throw Error('Automatic mode is running. Stop it before using manual controls.');
    if (request.action === 'analyze') {
      if (request.auto) {
        void automate(request.tabId);
        return {message: 'Automatic mode started.'};
      }
      await analyze(request.tabId);
      return {message: (await chrome.storage.local.get('status')).status};
    }
    if (request.action === 'chooseNext') return report(await page(request.tabId, 'chooseNext'));
    const answer = suggestions.get(request.tabId);
    if (!answer) throw Error('Analyze this question first.');
    if (request.action === 'apply') return report(await page(request.tabId, 'apply', [answer.fingerprint, answer.index]));
    if (request.action === 'next') {
      const result = await page(request.tabId, 'next', [answer.fingerprint]);
      suggestions.delete(request.tabId);
      return report(result);
    }
    throw Error('Unknown command.');
  })().then(reply).catch(error => reply({error: error.message}));
  return true;
});
