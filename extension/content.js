(() => {
  if (globalThis.mindtapAssistant?.version === 2) return;
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const text = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  function question(override = '') {
    const inputs = [...document.querySelectorAll('input[type=radio], [role=radio]')].filter(visible);
    const groups = new Map();
    for (const input of inputs) {
      const key = input.closest('[role=radiogroup],fieldset') || input.name || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(input);
    }
    if (groups.size !== 1) throw Error('Expected one visible multiple-choice question. Open a single question.');
    const controls = [...groups.values()][0];
    if (controls.length < 2 || controls.length > 12) throw Error('Unsupported answer choices.');
    const choices = controls.map(input => {
      const labelled = (input.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => text(document.getElementById(id))).join(' ');
      const labels = input.labels ? [...input.labels].map(text).join(' ') : '';
      return labels || labelled || input.getAttribute('aria-label') || text(input.closest('label')) || text(input.parentElement);
    });
    if (choices.some(choice => !choice) || new Set(choices).size !== choices.length) throw Error('Could not read distinct answer labels.');
    let container = controls[0].closest('fieldset,[role=radiogroup]') || controls[0].parentElement;
    while (container.parentElement && !controls.every(input => container.contains(input))) container = container.parentElement;
    // Prefer explicit question elements; answer controls can be deeply nested.
    let prompt = override.trim();
    let promptContainer = container;
    const selectors = 'legend,[data-question-text],.question-text,.questionText,.question-stem,.questionStem,.question-prompt,.stem,[role=heading]';
    for (let depth = 0; !prompt && container && depth < 14; depth++, container = container.parentElement) {
      const candidates = [...container.querySelectorAll(selectors)]
        .filter(el => visible(el) && !controls.some(input => el.contains(input)))
        .map(el => ({el, value: text(el)})).filter(item => item.value && item.value.length <= 12000);
      if (candidates.length === 1) {
        prompt = candidates[0].value;
        promptContainer = container;
        break;
      }
      // Never fall back to unrelated text from the whole document.
      if (container === document.body || container === document.documentElement) break;
      const candidate = text(container);
      if (candidate.length > 12000) continue;
      let cleaned = candidate;
      for (const choice of choices) cleaned = cleaned.replace(choice, '');
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      if (cleaned && !/^(next|continue|select (one|an answer)|submit)$/i.test(cleaned)) {
        prompt = cleaned;
        promptContainer = container;
      }
    }
    if (!prompt) throw Error('Could not identify the question prompt. Paste the question into the extension’s Question text field, then analyze again.');
    if (!override && promptContainer?.querySelector('img,canvas,svg,video')) throw Error('This question may contain a diagram. Text-only analysis is unsupported.');
    if (prompt.length > 12000) throw Error('Question text exceeds 12000 characters.');
    return {prompt, choices, controls, fingerprint: JSON.stringify([prompt, choices])};
  }
  globalThis.mindtapAssistant = {
    version: 2,
    read(override) { const {controls, ...data} = question(override); return data; },
    apply(expected, index, override) {
      const data = question(override);
      if (data.fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      const control = data.controls[index];
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') throw Error('Answer control unavailable.');
      control.click();
      if (!(control.checked || control.getAttribute('aria-checked') === 'true')) throw Error('Selection could not be verified.');
      return 'Answer selected.';
    },
    next(expected, override) {
      if (question(override).fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      const buttons = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')]
        .filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .filter(el => /^(next|next question|continue)$/i.test(text(el) || el.value || el.getAttribute('aria-label') || ''));
      if (buttons.length !== 1) throw Error('Could not identify one Next button. Advance manually.');
      buttons[0].click();
      return 'Next clicked.';
    }
  };
})();
