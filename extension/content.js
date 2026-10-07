(() => {
  if (globalThis.mindtapAssistant?.version === 7) return;
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const text = (el, excluded = new Set()) => {
    const read = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE || excluded.has(node)) return '';
      if (node.matches('script,style,svg,[aria-hidden="true"],[hidden],.material-icons,mat-icon')) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return '';
      const value = [...node.childNodes].map(read).join('');
      if (node.tagName === 'SUP') return `^(${value})`;
      if (node.tagName === 'SUB') return `_(${value})`;
      return /^(P|DIV|LI|BR|LEGEND|LABEL|SECTION|H[1-6])$/.test(node.tagName) ? ` ${value} ` : value;
    };
    return el ? read(el).replace(/\s+/g, ' ').trim() : '';
  };
  let chosenNext = null;
  const enabled = el => el.isConnected && visible(el) && !el.disabled && !el.closest('[aria-disabled="true"],[inert]');
  function nextLabel(value) {
    return /^(next(?: question| page)?|continue)$/i.test((value || '')
      .replace(/(?:arrow[_ -]?(?:forward|right)|chevron[_ -]?right|navigate[_ -]?next)/gi, '')
      .replace(/[→›»➜➔⟶➡\u200b-\u200d\ufe0f]/g, '').replace(/\s+/g, ' ').trim());
  }
  function findNext() {
    if (chosenNext) {
      if (!enabled(chosenNext)) throw Error('The chosen Next control is no longer available. Use Choose Next button again.');
      return chosenNext;
    }
    const candidates = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')]
      .filter(enabled)
      .filter(el => [el.getAttribute('aria-label'), el.getAttribute('title'), text(el), el.value].some(nextLabel));
    // A nested span with role=button and its parent are one actionable control.
    const buttons = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
    if (buttons.length !== 1) throw Error(`Found ${buttons.length} possible Next buttons. Use Choose Next button in the extension, then click the page’s Next control once.`);
    return buttons[0];
  }
  function question() {
    const inputs = [...document.querySelectorAll('input[type=radio], [role=radio]')]
      .filter(el => visible(el) || [...(el.labels || [])].some(visible))
      .filter(el => !(el.matches('[role=radio]') && el.querySelector('input[type=radio]')));
    const groups = new Map();
    for (const input of inputs) {
      const key = input.closest('[role=radiogroup],fieldset') || input.name || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(input);
    }
    if (inputs.some(input => input.closest('[aria-busy="true"]'))) throw Error('Question is still loading.');
    if (groups.size !== 1) throw Error('Expected one visible multiple-choice question. Open a single question.');
    const controls = [...groups.values()][0];
    if (controls.length < 2 || controls.length > 12) throw Error('Unsupported answer choices.');
    const answerNodes = new Set();
    const choices = controls.map(input => {
      const ownLabels = [...(input.labels || [])].filter(label =>
        !controls.some(other => other !== input && label.contains(other)));
      const labelledNodes = (input.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)).filter(Boolean)
        .filter(node => !controls.some(other => other !== input &&
          (node.contains(other) || (other.getAttribute('aria-labelledby') || '').split(/\s+/).includes(node.id))));
      // Custom radios often have an empty label or an icon-only parent. Walk only
      // within this answer's row; never read an ancestor containing other choices.
      let row = input;
      let rowText = text(row);
      for (let parent = input.parentElement; parent && parent !== document.body && parent !== document.documentElement;
           parent = parent.parentElement) {
        if (controls.some(other => other !== input && parent.contains(other))) break;
        row = parent;
        rowText = text(row);
        if (rowText) break;
      }
      ownLabels.forEach(label => answerNodes.add(label));
      labelledNodes.forEach(node => answerNodes.add(node));
      answerNodes.add(row);
      answerNodes.add(input);
      const labels = ownLabels.map(label => text(label)).filter(Boolean).join(' ');
      const labelled = labelledNodes.map(node => text(node)).filter(Boolean).join(' ');
      return labels || labelled || rowText || input.getAttribute('aria-label') || '';
    });
    if (choices.some(choice => !choice) || new Set(choices).size !== choices.length) throw Error('Could not read distinct answer labels.');
    let container = controls[0].closest('fieldset,[role=radiogroup]') || controls[0].parentElement;
    while (container.parentElement && !controls.every(input => container.contains(input))) container = container.parentElement;
    // Prefer explicit question elements; answer controls can be deeply nested.
    let prompt = '';
    let promptContainer = container;
    const selectors = 'legend,[data-question-text],.question-text,.questionText,.question-stem,.questionStem,.question-prompt,.stem';
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
      const excluded = new Set(answerNodes);
      container.querySelectorAll('button,a,[role=button],[role=navigation],[role=progressbar],.pagination').forEach(el => excluded.add(el));
      const cleaned = text(container, excluded);
      if (cleaned.length > 12000) continue;
      if (cleaned && !/^(next|continue|select (one|an answer)|submit|\d+\s+of\s+\d+)$/i.test(cleaned)) {
        prompt = cleaned;
        promptContainer = container;
      }
    }
    if (!prompt) throw Error('Could not identify the question prompt. Open a single visible question and try again.');
    if (promptContainer?.querySelector('img,canvas,svg,video')) throw Error('This question may contain a diagram. Text-only analysis is unsupported.');
    if (prompt.length > 12000) throw Error('Question text exceeds 12000 characters.');
    return {prompt, choices, controls, fingerprint: JSON.stringify([prompt, choices])};
  }
  globalThis.mindtapAssistant = {
    version: 7,
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
    verify(expected, index) {
      const data = question();
      if (data.fingerprint !== expected) throw Error('Question changed before selection could be verified.');
      const selected = data.controls.map((control, i) => control.checked || control.getAttribute('aria-checked') === 'true' ? i : -1).filter(i => i >= 0);
      if (selected.length !== 1 || selected[0] !== index) throw Error('The displayed selected answer does not match the suggestion.');
      return {index, text: data.choices[index]};
    },
    chooseNext() {
      return new Promise((resolve, reject) => {
        const banner = document.createElement('div');
        banner.textContent = 'Click the page’s Next button to identify it. This click will not advance. Escape cancels.';
        banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#172033;color:white;padding:14px;border-radius:8px;font:14px system-ui;pointer-events:none';
        document.documentElement.append(banner);
        const clean = () => { clearTimeout(timer); banner.remove(); document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true); };
        const click = event => {
          event.preventDefault(); event.stopImmediatePropagation();
          const target = event.target.closest('button,a,[role=button],input[type=button],input[type=submit],[tabindex]') || event.target;
          if (!enabled(target)) { clean(); reject(Error('That control is unavailable. Choose an enabled Next button.')); return; }
          chosenNext = target;
          clean(); resolve('Next control identified. Open the extension and click Next, or start automatic mode.');
        };
        const key = event => { if (event.key === 'Escape') { clean(); reject(Error('Next selection cancelled.')); } };
        const timer = setTimeout(() => { clean(); reject(Error('Next selection timed out. Choose Next again.')); }, 30000);
        document.addEventListener('click', click, true);
        document.addEventListener('keydown', key, true);
      });
    },
    next(expected) {
      if (question().fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      findNext().click();
      return 'Next clicked.';
    }
  };
})();
