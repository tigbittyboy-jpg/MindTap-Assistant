// Watches only the opened Cengage reader; it does not navigate or fetch book pages.
(() => {
  let enabled = false;
  let previous = '';
  let saved = '';
  let busy = false;
  let timer;
  let lastState = '';
  async function reportState(message) {
    if (message === lastState) return;
    lastState = message;
    await chrome.storage.local.set({textbookWatcherStatus: message});
  }
  async function check() {
    if (!enabled || busy) return;
    let signature;
    let section;
    try {
      section = globalThis.mindtapAssistant.textbook();
      signature = JSON.stringify(section);
    } catch (error) { previous = ''; await reportState('Waiting for textbook: ' + error.message); return; }
    // Require identical text on two polls so partially loaded sections aren't saved.
    if (signature !== previous) { previous = signature; await reportState('Reading section: ' + section.title + ' — waiting for text to settle…'); return; }
    if (signature === saved) return;
    busy = true;
    await reportState('Saving section: ' + section.title + '…');
    try {
      const result = await chrome.runtime.sendMessage({action: 'autoSaveTextbook'});
      if (result && !result.error) { saved = signature; await reportState('Watching for the next section. Current section is saved.'); }
      else if (!result) { await reportState('Save not acknowledged. Retrying…'); }
      else {
        enabled = false;
        clearInterval(timer);
        await chrome.storage.local.set({autoSaveTextbook: false});
        await reportState('Auto-save stopped: ' + result.error);
      }
    } catch (error) { await reportState('Save interrupted; retrying: ' + error.message); }
    finally { busy = false; }
  }
  function configure(value) {
    enabled = value !== false;
    previous = ''; saved = '';
    clearInterval(timer);
    if (!enabled) void reportState('Auto-save is off.');
    if (enabled) { timer = setInterval(check, 2000); void check(); }
  }
  chrome.storage.local.get('autoSaveTextbook').then(settings => configure(settings.autoSaveTextbook));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.autoSaveTextbook) configure(changes.autoSaveTextbook.newValue);
  });
})();
