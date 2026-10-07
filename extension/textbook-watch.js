// Watches only the opened Cengage reader; it does not navigate or fetch book pages.
(() => {
  let enabled = false;
  let previous = '';
  let saved = '';
  let busy = false;
  let timer;
  async function check() {
    if (!enabled || busy || document.visibilityState === 'hidden') return;
    let signature;
    try {
      const section = globalThis.mindtapAssistant.textbook();
      signature = JSON.stringify(section);
    } catch { previous = ''; return; }
    // Require identical text on two polls so partially loaded sections aren't saved.
    if (signature !== previous) { previous = signature; return; }
    if (signature === saved) return;
    busy = true;
    try {
      const result = await chrome.runtime.sendMessage({action: 'autoSaveTextbook'});
      if (!result?.error) saved = signature;
      else {
        enabled = false;
        clearInterval(timer);
        await chrome.storage.local.set({autoSaveTextbook: false});
      }
    } catch { /* A later poll can retry after a transient service-worker restart. */ }
    finally { busy = false; }
  }
  function configure(value) {
    enabled = value === true;
    previous = ''; saved = '';
    clearInterval(timer);
    if (enabled) { timer = setInterval(check, 2000); void check(); }
  }
  chrome.storage.local.get('autoSaveTextbook').then(settings => configure(settings.autoSaveTextbook));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.autoSaveTextbook) configure(changes.autoSaveTextbook.newValue);
  });
})();
