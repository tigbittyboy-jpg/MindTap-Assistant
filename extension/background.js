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
let historyQueue = Promise.resolve();
function recordHistory(entry) {
  historyQueue = historyQueue.catch(() => {}).then(async () => {
    const {runHistory = []} = await chrome.storage.session.get('runHistory');
    const existing = runHistory.findIndex(item => item.id === entry.id);
    if (existing < 0) runHistory.push(entry);
    else runHistory[existing] = {...runHistory[existing], ...entry};
    await chrome.storage.session.set({runHistory: runHistory.slice(-100)});
  });
  return historyQueue;
}
async function stableQuestion(tabId) {
  let previous = await page(tabId, 'read');
  for (let attempt = 0; attempt < 10; attempt++) {
    await delay(250);
    const current = await page(tabId, 'read');
    if (current.fingerprint === previous.fingerprint) return current;
    previous = current;
  }
  throw Error('The question is still changing. Wait for it to load and analyze again.');
}
async function verifySelection(tabId, answer) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt++) {
    await delay(100);
    try {
      const selected = await page(tabId, 'verify', [answer.fingerprint, answer.index]);
      await recordHistory({id: answer.historyId, selectedIndex: selected.index, selectedText: selected.text, selectionVerified: true});
      return selected;
    } catch (error) { lastError = error; }
  }
  await recordHistory({id: answer.historyId, selectionVerified: false, error: lastError.message});
  throw lastError;
}
const referenceTokens = value => [...new Set((value.toLowerCase().match(/[a-z0-9]+/g) || [])
  .filter(word => (word.length > 2 || /\d/.test(word)) && !new Set(['the','and','for','with','from','that','this','which','what','are','has','have','into','when','only','not','all','one','its','can','will','also']).has(word)))];
function findReferences(data, sections) {
  const terms = referenceTokens(data.prompt + ' ' + data.choices.join(' '));
  const candidates = [];
  for (const section of sections) {
    for (const paragraph of section.text.split(/\n\n+/)) {
      // Keep excerpts bounded so questions still fit the model context.
      for (let start = 0; start < paragraph.length; start += 750) {
        const excerpt = paragraph.slice(start, start + 900);
        const tokens = new Set(referenceTokens(section.title + ' ' + excerpt));
        const score = terms.filter(term => tokens.has(term)).length;
        if (score >= 2) {
          candidates.push({source: section.title, text: excerpt, score});
          candidates.sort((a, b) => b.score - a.score);
          if (candidates.length > 3) candidates.pop();
        }
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 3).map(({source, text}) => ({source, text}));
}
let textbookSaveQueue = Promise.resolve();
function saveTextbook(tabId, automatic = false) {
  const pending = textbookSaveQueue.catch(() => {}).then(() => saveTextbookSection(tabId, automatic));
  textbookSaveQueue = pending;
  return pending;
}
function clearTextbook() {
  const pending = textbookSaveQueue.catch(() => {}).then(async () => {
    await chrome.storage.local.set({autoSaveTextbook: false, textbookSections: [],
      textbookWatcherStatus: 'Auto-save is off.', textbookSaveStatus: 'Textbook archive cleared. Auto-save is off. 0 MB of 10 MB used.'});
    return {message: 'Textbook archive cleared. Auto-save is off.'};
  });
  textbookSaveQueue = pending;
  return pending;
}
async function saveTextbookSection(tabId, automatic) {
  if (automatic && (await chrome.storage.local.get('autoSaveTextbook')).autoSaveTextbook === false) return {message: 'Auto-save is off.'};
  const section = await page(tabId, 'textbook');
  if (automatic && (await chrome.storage.local.get('autoSaveTextbook')).autoSaveTextbook === false) return {message: 'Auto-save is off.'};
  const {textbookSections = []} = await chrome.storage.local.get('textbookSections');
  if (textbookSections.some(item => item.text === section.text)) {
    const bytes = new TextEncoder().encode(JSON.stringify(textbookSections)).length;
    const message = `Already saved: ${section.title}\n${textbookSections.length} section(s) · ${(bytes / (1024 * 1024)).toFixed(2)} MB of 10 MB used.`;
    await chrome.storage.local.set({textbookSaveStatus: message});
    return {message};
  }
  const archive = [...textbookSections, section];
  const bytes = new TextEncoder().encode(JSON.stringify(archive)).length;
  if (bytes > 10 * 1024 * 1024) throw Error('Textbook archive has reached its 10 MB limit.');
  await chrome.storage.local.set({textbookSections: archive});
  const message = `Saved: ${section.title}\n${archive.length} section(s) · ${(bytes / (1024 * 1024)).toFixed(2)} MB of 10 MB used.`;
  await chrome.storage.local.set({textbookSaveStatus: message});
  return automatic ? {message} : report(message);
}
async function analyze(tabId) {
  suggestions.delete(tabId);
  const data = await stableQuestion(tabId);
  const {textbookSections = []} = await chrome.storage.local.get('textbookSections');
  const references = findReferences(data, textbookSections);
  await report(`Analyzing with textbook references…\n${references.length} textbook excerpt(s) found.`);
  const historyId = crypto.randomUUID();
  await recordHistory({id: historyId, timestamp: new Date().toISOString(), prompt: data.prompt, choices: data.choices});
  let answer;
  try {
    const response = await fetch('http://127.0.0.1:8765/analyze', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prompt: data.prompt, choices: data.choices, references}), signal: AbortSignal.timeout(100000)
    });
    answer = await response.json();
    if (!response.ok) throw Error(answer.error || 'Backend request failed.');
    if (answer.analysis_mode !== 'single_pass') throw Error('Restart the v0.5.5.3 backend to use single-pass answers.');
    if (references.length && answer.reference_count !== references.length) throw Error('Textbook context was not accepted. Restart the v0.5 backend.');
    if (!Number.isInteger(answer.index) || answer.index < 0 || answer.index >= data.choices.length ||
        !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1 || typeof answer.explanation !== 'string') throw Error('Invalid AI response.');
    if (answer.answer_text !== undefined && answer.answer_text !== data.choices[answer.index]) throw Error('AI answer text and index disagree.');
    if (answer.textbook_resolved === true) {
      const source = references[answer.evidence_source_index];
      if (!source || source.source !== answer.evidence_source || typeof answer.evidence_quote !== 'string' ||
          answer.evidence_quote.trim().length < 20 || !source.text.replace(/\s+/g, ' ').includes(answer.evidence_quote.replace(/\s+/g, ' ').trim())) {
        throw Error('Textbook reference evidence could not be verified. Review manually.');
      }
    }
    await recordHistory({id: historyId, suggestedIndex: answer.index, suggestedText: data.choices[answer.index], confidence: answer.confidence,
      explanation: answer.explanation, provider: answer.provider || 'unknown', model: answer.model || 'unknown', thinking: answer.thinking, textbookResolved: answer.textbook_resolved, evidenceQuote: answer.evidence_quote});
  } catch (error) {
    await recordHistory({id: historyId, error: error.message});
    throw error;
  }
  const suggestion = {...answer, fingerprint: data.fingerprint, historyId};
  suggestions.set(tabId, suggestion);
  await report(`Suggestion: ${data.choices[answer.index]}\nConfidence (AI estimate): ${Math.round(answer.confidence * 100)}%\n${answer.explanation}\n\n${answer.textbook_resolved ? "Textbook reference: " + answer.evidence_source + "\n“" + answer.evidence_quote + "”" : ""}\n\n${references.length ? "Reference excerpts supplied: " + [...new Set(references.map(item => item.source))].join("; ") : "No matching saved textbook excerpts; answered from model knowledge."}`);
  return suggestion;
}
async function automate(tabId) {
  running = true; stopped = false;
  const seen = new Set();
  let answer;
  try {
    await chrome.storage.local.set({automationActive: true});
    while (!stopped) {
      answer = await analyze(tabId);
      if (seen.has(answer.fingerprint)) throw Error('Automatic mode stopped: this question was already processed.');
      seen.add(answer.fingerprint);
      if (stopped) break;
      await page(tabId, 'apply', [answer.fingerprint, answer.index]);
      await verifySelection(tabId, answer);
      await delay(750);
      if (stopped) break;
      await page(tabId, 'verify', [answer.fingerprint, answer.index]);
      const navigation = await page(tabId, 'advance', [answer.fingerprint]);
      await recordHistory({id: answer.historyId, nextClicked: true});
      suggestions.delete(tabId);
      if (navigation.kind === 'review') {
        await report('Review opened. Waiting for Finish…');
        for (let attempt = 0; attempt < 20 && !stopped; attempt++) {
          await delay(500);
          if (stopped) break;
          if (await page(tabId, 'finishReview')) {
            await recordHistory({id: answer.historyId, finishClicked: true});
            await report('Finish clicked. Automatic mode completed.');
            return;
          }
        }
        if (!stopped) throw Error('Review opened, but Finish was not available. Finish manually.');
        break;
      }
      let changed = false;
      let previousFingerprint;
      for (let attempt = 0; attempt < 20 && !stopped; attempt++) {
        await delay(500);
        try {
          const fingerprint = (await page(tabId, 'read')).fingerprint;
          changed = fingerprint !== answer.fingerprint && fingerprint === previousFingerprint;
          previousFingerprint = fingerprint;
        } catch { previousFingerprint = undefined; continue; }
        if (changed) break;
      }
      if (!changed && !stopped) throw Error('Automatic mode stopped: next question did not appear.');
    }
    await report('Automatic mode stopped.');
  } catch (error) {
    if (answer?.historyId) await recordHistory({id: answer.historyId, error: error.message});
    await report(error.message);
  }
  finally { running = false; await chrome.storage.local.set({automationActive: false}); }
}
chrome.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const assistantPage = (sender.url || '').split('?')[0] === chrome.runtime.getURL('popup.html');
  if (sender.tab && !assistantPage) {
    if (request.action !== 'autoSaveTextbook' || sender.frameId !== 0 ||
        !/^https:\/\/ebooks\.cengage\.com\//.test(sender.url || '')) return;
    saveTextbook(sender.tab.id, true).then(reply).catch(async error => {
      await chrome.storage.local.set({textbookSaveStatus: error.message});
      reply({error: error.message});
    });
    return true;
  }
  (async () => {
    if (request.action === 'getAutomationState') return {active: running && !stopped};
    if (request.action === 'stop') { stopped = true; await chrome.storage.local.set({automationActive: false}); return report('Stop requested.'); }
    if (request.action === 'clearTextbook') return clearTextbook();
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
    if (request.action === 'apply') {
      await page(request.tabId, 'apply', [answer.fingerprint, answer.index]);
      await verifySelection(request.tabId, answer);
      return report('Answer selected and verified.');
    }
    if (request.action === 'next') {
      await verifySelection(request.tabId, answer);
      const result = await page(request.tabId, 'next', [answer.fingerprint]);
      await recordHistory({id: answer.historyId, nextClicked: true});
      suggestions.delete(request.tabId);
      return report(result);
    }
    throw Error('Unknown command.');
  })().then(reply).catch(error => reply({error: error.message}));
  return true;
});
