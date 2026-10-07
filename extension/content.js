(() => {
  if (globalThis.mindtapAssistant?.version === 13) return;
  const visible = el => !!el.getClientRects().length && el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden';
  const text = (el, excluded = new Set()) => {
    const read = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE || excluded.has(node)) return '';
      if (node.matches('script,style,svg,[hidden],.material-icons,mat-icon,.sr-only')) return '';
      // Learnosity marks its displayed answer copy aria-hidden because a separate
      // accessible copy labels the radio. Read the displayed copy only.
      const displayedAnswer = node.closest('.lrn-possible-answer');
      if (node.getAttribute('aria-hidden') === 'true' && !displayedAnswer) return '';
      const style = node.ownerDocument.defaultView.getComputedStyle(node);
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
  function navigationLabel(value) {
    return (value || '')
      .replace(/(?:arrow[_ -]?(?:forward|right)|chevron[_ -]?right|navigate[_ -]?next)/gi, '')
      .replace(/(?:checklist|fact_check)/gi, '').replace(/[→›»➜➔⟶➡✓✔☑\u200b-\u200d\ufe0f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function nextLabel(value) { return /^(next(?: question| page)?|continue|review)$/i.test(navigationLabel(value)); }
  function matchesLabel(el, pattern) {
    return [el.getAttribute('aria-label'), el.getAttribute('title'), text(el), el.value]
      .some(value => pattern.test(navigationLabel(value)));
  }
  function actionButtons(pattern) {
    const candidates = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')]
      .filter(enabled).filter(el => matchesLabel(el, pattern));
    return candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
  }
  function findNext() {
    if (chosenNext) {
      if (!enabled(chosenNext)) throw Error('The chosen Next control is no longer available. Advance manually and analyze the next question.');
      return chosenNext;
    }
    const candidates = [...document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit]')]
      .filter(enabled)
      .filter(el => [el.getAttribute('aria-label'), el.getAttribute('title'), text(el), el.value].some(nextLabel));
    // A nested span with role=button and its parent are one actionable control.
    const buttons = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
    if (buttons.length !== 1) throw Error(`Found ${buttons.length} possible Next buttons. Advance manually and analyze the next question.`);
    return buttons[0];
  }
  function question() {
    const inputs = [...document.querySelectorAll('input[type=radio], [role=radio]')]
      .filter(el => visible(el) || [...(el.labels || [])].some(visible))
      .filter(el => !(el.matches('[role=radio]') && el.querySelector('input[type=radio], [role=radio]')));
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
    const placeholder = value => !value || /^(?:[a-z][.)]?|select(?: this)?(?: answer| option)?|choose(?: this)?(?: answer| option)?|radio(?: button)?)$/i.test(value.trim());
    const choices = controls.map(input => {
      const ownLabels = [...(input.labels || [])].filter(label =>
        !controls.some(other => other !== input && label.contains(other)));
      const labelledNodes = (input.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)).filter(Boolean)
        .map(node => node.closest('.lrn-possible-answer') || node)
        .filter(node => !controls.some(other => other !== input &&
          (node.contains(other) || (other.getAttribute('aria-labelledby') || '').split(/\s+/).includes(node.id))));
      // Custom radios often have an empty label or an icon-only parent. Walk only
      // within this answer's row; never read an ancestor containing other choices.
      const displayedText = node => {
        const answers = [...node.querySelectorAll('.lrn-possible-answer')].filter(answer => {
          for (let ancestor = answer; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (ancestor.hidden || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return false;
          }
          return visible(answer);
        });
        if (answers.length !== 1) return '';
        answerNodes.add(answers[0]);
        return text(answers[0]);
      };
      let row = input;
      let rowText = text(row);
      for (let parent = input.parentElement; parent && parent !== document.body && parent !== document.documentElement;
           parent = parent.parentElement) {
        if (controls.some(other => other !== input && parent.contains(other))) break;
        row = parent;
        rowText = displayedText(row) || text(row);
        if (!placeholder(rowText)) break;
      }
      ownLabels.forEach(label => answerNodes.add(label));
      labelledNodes.forEach(node => answerNodes.add(node));
      answerNodes.add(row);
      answerNodes.add(input);
      const labels = ownLabels.map(label => displayedText(label) || text(label)).filter(Boolean).join(' ');
      const labelled = labelledNodes.map(node => text(node)).filter(Boolean).join(' ');
      const candidates = [labels, labelled, rowText, input.getAttribute('aria-label') || ''];
      return candidates.find(value => !placeholder(value)) || candidates.find(Boolean) || '';
    });
    if (choices.some(choice => !choice) || new Set(choices).size !== choices.length) {
      const unreadable = choices.filter(choice => !choice).length;
      const duplicates = choices.filter(Boolean).length - new Set(choices.filter(Boolean)).size;
      throw Error(`Could not read distinct answer labels (${controls.length} controls, ${unreadable} unreadable, ${duplicates} duplicate labels). Please share a sanitized HTML sample of the answer rows.`);
    }
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
    version: 13,
    textbook() {
      if (location.hostname !== 'ebooks.cengage.com') throw Error('Open a Cengage textbook section before saving.');
      // Cengage's reader shell stores the actual section in a same-origin frame.
      const frame = document.querySelector('#reading-section iframe#iframe-page,iframe#iframe-page');
      let bookDocument = document;
      if (frame) {
        if (!visible(frame)) throw Error('The textbook page is not visible. Open a section first.');
        try { bookDocument = frame.contentDocument; }
        catch { throw Error('Cannot read this textbook frame. It must be accessible on the same site.'); }
        if (!bookDocument?.body) throw Error('The textbook frame is still loading or inaccessible. Wait and try again.');
      }
      const paragraphs = [...bookDocument.querySelectorAll('p[data-cgi]')]
        .filter(visible).map(node => text(node)).filter(Boolean);
      if (!paragraphs.length) throw Error('No readable textbook paragraphs found. Open a section and wait for it to load.');
      const headings = [...bookDocument.querySelectorAll('h1,h2,h3')].filter(visible);
      const title = text(headings[0]) || bookDocument.title || document.title || 'Textbook section';
      const content = paragraphs.join('\n\n');
      if (content.length > 1000000) throw Error('This section exceeds one million characters. Open a smaller subsection.');
      return {title: title.slice(0, 200), text: content};
    },
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
    advance(expected) {
      const data = question();
      if (data.fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      const selected = data.controls.filter(control => control.checked || control.getAttribute('aria-checked') === 'true');
      if (selected.length !== 1) throw Error('Select and verify an answer before advancing.');
      const button = findNext();
      const kind = matchesLabel(button, /^review$/i) ? 'review' : 'next';
      button.click();
      return {kind};
    },
    finishReview() {
      // Do not finish while the last question remains visible during navigation.
      if ([...document.querySelectorAll('input[type=radio],[role=radio]')]
          .some(el => visible(el) || [...(el.labels || [])].some(visible))) return false;
      const buttons = actionButtons(/^finish$/i);
      if (buttons.length > 1) throw Error('Found multiple Finish buttons. Finish manually.');
      if (!buttons.length) return false;
      buttons[0].click();
      return true;
    },
    next(expected) {
      if (question().fingerprint !== expected) throw Error('Question changed. Analyze it again.');
      const button = findNext();
      const review = matchesLabel(button, /^review$/i);
      button.click();
      return review ? 'Review opened. Finish manually, or use automatic mode for the full flow.' : 'Next clicked.';
    }

  };
})();
