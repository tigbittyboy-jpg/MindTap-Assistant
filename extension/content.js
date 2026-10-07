(() => {
  if (globalThis.mindtapAssistant) return;
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const text = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  function question() {
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
    // Look outward for the prompt, without sending the entire page to the provider.
    let prompt = '';
    for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
      const candidate = text(container);
      if (candidate.length > 12000) break;
      let cleaned = candidate;
      for (const choice of choices) cleaned = cleaned.replace(choice, '');
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 15) { prompt = cleaned; break; }
    }
    if (!prompt) throw Error('Could not identify the question prompt.');
    if (container?.querySelector('img,canvas,svg,video')) throw Error('This question may contain a diagram. Text-only analysis is unsupported.');
    return {prompt, choices, controls, fingerprint: JSON.stringify([prompt, choices])};
  }
  globalThis.mindtapAssistant = {
    read() { const {controls, ...data} = question(); return data; },
    apply(expected, index) {
      const data = question();
      if (data.fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      const control = data.controls[index];
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') throw Error('Answer control unavailable.');
      control.click();
      if (!(control.checked || control.getAttribute('aria-checked') === 'true')) throw Error('Selection could not be verified.');
      return 'Answer selected.';
    },
    next(expected) {
      if (question().fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      const buttons = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')]
        .filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .filter(el => /^(next|next question|continue)$/i.test(text(el) || el.value || el.getAttribute('aria-label') || ''));
      if (buttons.length !== 1) throw Error('Could not identify one Next button. Advance manually.');
      buttons[0].click();
      return 'Next clicked.';
    }
  };
})();
