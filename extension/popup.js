const status = document.querySelector('#status');
async function command(action) {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (action === 'chooseNext') status.textContent = 'Click the page’s Next button once. The identifying click will not advance.';
    const result = await chrome.runtime.sendMessage({action, tabId: tab.id,
      auto: document.querySelector('#auto').checked});
    status.textContent = result.error || result.message;
  } catch (error) { status.textContent = error.message; }
}
for (const action of ['analyze', 'apply', 'next', 'chooseNext', 'stop', 'saveTextbook']) {
  document.querySelector(`#${action}`).addEventListener('click', () => command(action));
}
chrome.storage.local.get('status').then(result => { if (result.status) status.textContent = result.status; });
chrome.storage.onChanged.addListener(changes => { if (changes.status) status.textContent = changes.status.newValue; });

const textbookToggle = document.querySelector('#autoSaveTextbook');
const textbookStatus = document.querySelector('#textbookStatus');
chrome.storage.local.get(['autoSaveTextbook', 'textbookSaveStatus']).then(settings => {
  textbookToggle.checked = settings.autoSaveTextbook === true;
  textbookStatus.textContent = settings.textbookSaveStatus || (textbookToggle.checked ? 'Auto-save is on. Open a textbook section.' : 'Textbook auto-save is off.');
});
textbookToggle.addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({autoSaveTextbook: textbookToggle.checked});
    textbookStatus.textContent = textbookToggle.checked ? 'Auto-save is on. Open a textbook section.' : 'Textbook auto-save is off.';
  } catch (error) { textbookStatus.textContent = error.message; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.textbookSaveStatus) textbookStatus.textContent = changes.textbookSaveStatus.newValue;
  if (changes.autoSaveTextbook) textbookToggle.checked = changes.autoSaveTextbook.newValue === true;
});
