importScripts('hvac-calculator.js');
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
function matchingText(value) {
  return value.toLowerCase().replace(/\br\s*-?\s*(\d{2,4}[a-z]*)\b/g, 'r$1')
    .replace(/\bvapour\b/g, 'vapor').replace(/\bsub[- ]?cooled\b/g, 'subcooled')
    .replace(/\bsuper[- ]?heated\b/g, 'superheated')
    .replace(/\b(?:exit|leaves|leaving)\b/g, 'outlet')
    .replace(/\b(?:entrance|enters|entering)\b/g, 'inlet')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function questionLocation(prompt) {
  const text = matchingText(prompt);
  const first = text.match(/\b(outlet|inlet) (?:of )?(?:the )?(condenser|compressor|evaporator)\b/);
  if (first) return {flow: first[1], component: first[2]};
  const reversed = text.match(/\b(condenser|compressor|evaporator) (outlet|inlet)\b/);
  return reversed ? {flow: reversed[2], component: reversed[1]} : null;
}
function matchesLocation(text, location) {
  if (!location) return true;
  const normalized = matchingText(text);
  return new RegExp(`\\b(?:${location.flow} (?:of )?(?:the )?${location.component}|${location.component} ${location.flow})\\b`).test(normalized);
}
function findReferences(data, sections) {
  const terms = referenceTokens(matchingText(data.prompt)).filter(term => !['state','refrigerant','should','would','could','called','following'].includes(term));
  const choiceTerms = referenceTokens(matchingText(data.choices.join(' ')));
  const location = questionLocation(data.prompt);
  const candidates = [];
  for (const section of sections) {
    for (const paragraph of section.text.split(/\n\n+/)) {
      // Keep excerpts bounded so questions still fit the model context.
      const starts = new Set();
      if (!location) for (let start = 0; start < paragraph.length; start += 750) starts.add(start);
      // Include windows around the asked component/connection, even deep in a section.
      if (location) for (const sentence of paragraph.matchAll(/[^.!?\n]+(?:[.!?]|$)/g)) {
        if (matchesLocation(sentence[0], location)) starts.add(sentence.index);
      }
      for (const start of starts) {
        let excerpt = paragraph.slice(start, start + 900);
        if (location) {
          // Keep the asked connection and its immediate explanation together.
          const nearby = excerpt.match(/[^.!?\n]+(?:[.!?]|$)/g) || [excerpt];
          const focused = [nearby[0]];
          for (const sentence of nearby.slice(1, 3)) {
            const nextLocation = questionLocation(sentence);
            if (nextLocation && (nextLocation.flow !== location.flow || nextLocation.component !== location.component)) break;
            focused.push(sentence);
          }
          excerpt = focused.join(' ').trim();
          if (!matchesLocation(excerpt, location)) continue;
        }
        const tokens = new Set(referenceTokens(matchingText(excerpt)));
        const questionOverlap = terms.filter(term => tokens.has(term)).length;
        const titleTokens = new Set(referenceTokens(matchingText(section.title)));
        const titleBonus = terms.filter(term => titleTokens.has(term)).length;
        const score = questionOverlap * 3 + titleBonus + choiceTerms.filter(term => tokens.has(term)).length + (location && matchesLocation(excerpt, location) ? 10 : 0);
        if (questionOverlap >= 2) {
          if (candidates.some(item => item.source === section.title && matchingText(item.text) === matchingText(excerpt))) continue;
          candidates.push({source: section.title, text: excerpt, score});
          candidates.sort((a, b) => b.score - a.score);
          if (candidates.length > 3) candidates.pop();
        }
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 3).map(({source, text}) => ({source, text}));
}
async function assistanceMode() {
  return (await chrome.storage.local.get('assistanceMode')).assistanceMode === 'textbook' ? 'textbook' : 'ai';
}
function compressorComparison(choice, sentence, previous = '') {
  const types = 'rotary|reciprocating|scroll|screw|centrifugal';
  const pattern = new RegExp(`\\b(${types}) compressors?\\b[^.!?]{0,180}\\b(smaller|larger|bigger) than (${types}) compressors?\\b`);
  const capacity = /\b(?:same|similar|equal|equivalent|comparable) capacit(?:y|ies)\b/;
  const wanted = matchingText(choice).match(pattern);
  if (!wanted || !capacity.test(matchingText(choice))) return false;
  let resolved = sentence;
  if (/^\s*(?:these compressors|they)\b/i.test(sentence)) {
    const subjects = [...new Set([...matchingText(previous).matchAll(new RegExp(`\\b(${types}) compressors?\\b`, 'g'))].map(item => item[1]))];
    if (subjects.length !== 1) return false;
    resolved = sentence.replace(/^(\s*)(?:these compressors|they)\b/i, `$1${subjects[0]} compressors`);
  }
  const found = matchingText(resolved).match(pattern);
  const direction = word => word === 'bigger' ? 'larger' : word;
  return !!found && capacity.test(matchingText(resolved)) && wanted[1] === found[1] &&
    wanted[3] === found[3] && direction(wanted[2]) === direction(found[2]);
}
function textbookTextMatch(data, references) {
  if (/\b(?:not|except|false|incorrect)\b/i.test(data.prompt)) return null;
  const normalize = matchingText;
  const terms = referenceTokens(normalize(data.prompt));
  const location = questionLocation(data.prompt);
  const matches = [];
  for (let index = 0; index < data.choices.length; index++) {
    const choice = normalize(data.choices[index]);
    if (choice.length < 3 || !/[a-z]/.test(choice) || /^(?:true|false|yes|no)$|\b(?:all|none) of (?:the )?above\b/.test(choice)) continue;
    const aliases = [choice];
    // HFC R-32 and R-32 name the same refrigerant; keep its entire designation.
    const refrigerant = choice.match(/^(?:hfc|hfo|hc) (r\d{2,4}[a-z]*)$/);
    if (refrigerant) aliases.push(refrigerant[1]);
    let derivedReason;
    let matchMethod;
    for (const reference of references) {
      const sentences = reference.text.match(/[^.!?\n]+(?:[.!?]|$)/g) || [reference.text];
      const evidence = sentences.map((sentence, index) => {
        // Carry explicit location into one following sentence about the same refrigerant.
        if (location && !matchesLocation(sentence, location) && index > 0 &&
            /^(?:it|this refrigerant|the refrigerant|this liquid|the liquid)\b/i.test(sentence.trim()) &&
            !questionLocation(sentence) && matchesLocation(sentences[index - 1], location)) {
          return sentences[index - 1] + ' ' + sentence;
        }
        if (/^\s*(?:these compressors|they)\b/i.test(sentence) && index > 0) return sentences[index - 1] + ' ' + sentence;
        return sentence;
      }).find(sentence => {
        const normalized = normalize(sentence);
        const text = ' ' + normalized + ' ';
        if (location && !matchesLocation(sentence, location)) return false;
        let choiceMatches = aliases.some(alias => text.includes(' ' + alias + ' '));
        const parts = sentence.match(/[^.!?\n]+(?:[.!?]|$)/g) || [sentence];
        const usedComparison = !choiceMatches && parts.some((part, index) => compressorComparison(choice, part, parts[index - 1] || ''));
        if (usedComparison) choiceMatches = true;
        // A stated single phase implies 100%; mixed percentages still require exact wording.
        if (!choiceMatches && location && /^100 (?:superheated vapor|subcooled liquid)$/.test(choice)) {
          const phaseWords = choice.replace(/^100 /, '').split(' ');
          choiceMatches = phaseWords.every(word => text.includes(' ' + word + ' '));
          const percentages = [...sentence.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi)].map(item => Number(item[1]));
          if (percentages.some(value => value !== 100) || /\b(?:mixture|mixed)\b/.test(normalized)) choiceMatches = false;
        }
        const normalStateQuestion = /\b(?:should|normally|normal|expected|typical)\b/i.test(data.prompt);
        const subcoolingDefinition = location?.component === 'condenser' && location.flow === 'outlet' && normalStateQuestion && choice === '100 subcooled liquid' &&
          /\bsubcooling\b/.test(normalized) && /\b(?:condenses|condensing|condensation|saturation|difference)\b/.test(normalized) &&
          !/\b(?:zero|0)(?: f| degrees?)? (?:of )?subcooling\b/.test(normalized);
        const usedSubcoolingRule = !choiceMatches && subcoolingDefinition;
        if (usedSubcoolingRule) choiceMatches = true;
        if (!choiceMatches) return false;
        if (/\b(?:not|never|no|without|unlike)\b|n['’]t\b/i.test(sentence)) return false;
        const tokens = new Set(referenceTokens(normalized));
        if (terms.filter(term => tokens.has(term)).length < 2) return false;
        if (usedComparison) {
          derivedReason = 'The passage gives the same smaller/larger comparison for the same capacity; “same capacity” matches “similar capacities.”';
          matchMethod = 'comparison';
        }
        if (usedSubcoolingRule) derivedReason = 'Subcooling means cooling liquid below its saturation temperature. The cited passage describes subcooling at this outlet, so the normal state is subcooled liquid.';
        return true;
      });
      if (evidence) { matches.push({index, source: reference.source, evidence: evidence.trim(), reason: derivedReason, method: matchMethod}); break; }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
let ptTable;
async function calculateQuestion(data) {
  if (!/\bsub[- ]?cool(?:ing|ed)?\b/i.test(data.prompt) || !/\b(?:psig|psia|psi|bar|kpa)\b/i.test(data.prompt)) return null;
  if (!ptTable) {
    const response = await fetch(chrome.runtime.getURL('data/r410a-pt.json'));
    if (!response.ok) throw Error('Bundled pressure–temperature table could not be loaded. Reload the extension.');
    ptTable = await response.json();
  }
  return hvacCalculator.calculateSubcooling(data, ptTable);
}
async function lookupTextbook(tabId) {
  suggestions.delete(tabId);
  const data = await stableQuestion(tabId);
  const {textbookSections = []} = await chrome.storage.local.get('textbookSections');
  const calculated = await calculateQuestion(data);
  if (calculated) {
    const references = findReferences(data, textbookSections);
    return report(`Calculated answer: ${calculated.answer_text}\nWhy: ${calculated.explanation}\nSource: ${calculated.calculation_source}\n\n` + (references.length ? references.map(item => `${item.source}\n${item.text}`).join('\n\n') : 'No matching saved passages needed; used the bundled R-410A lookup.'));
  }
  if (!textbookSections.length) return report('No textbook sections saved yet. Open your textbook sections with auto-save on, then return here and find passages. No AI or backend is needed.');
  const references = findReferences(data, textbookSections);
  if (!references.length) {
    const location = questionLocation(data.prompt);
    return report(location ? `No matching saved passages describe the ${location.component} ${location.flow}. Open the textbook section describing that connection and wait for it to save, then try again. Other component connections are excluded.` : 'No matching saved passages found. Open the relevant textbook section to save it, then try again. Choose your answer manually.');
  }
  const match = textbookTextMatch(data, references);
  const location = questionLocation(data.prompt);
  const reason = match?.reason || (location ? `The passage matches the ${location.component} ${location.flow} asked about and this choice's phase description.` : 'Only this choice matches a relevant, non-negated sentence in the retrieved passages.');
  const heading = match
    ? `Possible answer (${match.method === "comparison" ? "text comparison" : match.reason ? "HVAC rule" : "text match"}): ${data.choices[match.index]}\nWhy: ${reason}\n${match.source}: “${match.evidence}”\nThis is a text match, not a verified answer. Choose manually.\n\n`
    : 'No distinct answer text match. Review these passages and choose manually.\n\n';
  return report(heading + 'Textbook passages · no AI\n\n' +
    references.map((item, index) => `${index + 1}. ${item.source}\n${item.text}`).join('\n\n'));

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
    answer = await calculateQuestion({...data, references});
    if (!answer) {
      const response = await fetch('http://127.0.0.1:8765/analyze', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prompt: data.prompt, choices: data.choices, references}), signal: AbortSignal.timeout(100000)
    });
    answer = await response.json();
    if (!response.ok) throw Error(answer.error || 'Backend request failed.');
    }
    if (answer.analysis_mode !== 'single_pass') throw Error('Restart the v0.5.5.4 backend to use single-pass answers.');
    if (references.length && answer.reference_count !== references.length) throw Error('Textbook context was not accepted. Restart the v0.5 backend.');
    if (!Number.isInteger(answer.index) || answer.index < 0 || answer.index >= data.choices.length ||
        !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1 || typeof answer.explanation !== 'string') throw Error('Invalid AI response.');
    if (answer.answer_text !== undefined && answer.answer_text !== data.choices[answer.index]) throw Error('AI answer text and index disagree.');
    await recordHistory({id: historyId, suggestedIndex: answer.index, suggestedText: data.choices[answer.index], confidence: answer.confidence,
      explanation: answer.explanation, provider: answer.provider || 'unknown', model: answer.model || 'unknown', thinking: answer.thinking, calculated: answer.calculated === true, cached: answer.cached === true});
  } catch (error) {
    await recordHistory({id: historyId, error: error.message});
    throw error;
  }
  if (await assistanceMode() !== 'ai') throw Error('Switched to textbook-only mode; AI suggestion discarded.');
  const suggestion = {...answer, fingerprint: data.fingerprint, historyId};
  suggestions.set(tabId, suggestion);
  await report(`${answer.calculated ? "Calculated answer" : "Suggestion"}: ${data.choices[answer.index]}\n${answer.calculated ? "Source: " + answer.calculation_source : "Confidence (AI estimate): " + Math.round(answer.confidence * 100) + "%"}\n${answer.explanation}\n${answer.cached ? "Cached answer reused.\n" : ""}\n${references.length ? "Reference excerpts supplied: " + [...new Set(references.map(item => item.source))].join("; ") : answer.calculated ? "Used bundled R-410A PT lookup; no AI generation." : "No matching saved textbook excerpts; answered from model knowledge."}`);
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
    if (request.action === 'setAssistanceMode') {
      if (!['ai', 'textbook'].includes(request.mode)) throw Error('Unknown assistance mode.');
      stopped = true; suggestions.clear();
      await chrome.storage.local.set({assistanceMode: request.mode, automationActive: false});
      return report(request.mode === 'textbook' ? 'Textbook-only mode. Find passages, then choose your answer manually. No AI or backend needed.' : 'AI mode. Analyze a question to get a suggestion.');
    }
    if (request.action === 'clearTextbook') return clearTextbook();
    if (running) throw Error('Automatic mode is running. Stop it before using manual controls.');
    const mode = await assistanceMode();
    if (mode === 'textbook') {
      if (request.action === 'analyze' && !request.auto) return lookupTextbook(request.tabId);
      throw Error('Textbook-only mode shows passages. Choose answers and navigate manually, or switch to Local AI.');
    }
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
