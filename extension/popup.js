const status = document.querySelector('#status');
const sourceWindow = Number(new URLSearchParams(location.search).get('sourceWindow'));
const detached = new URLSearchParams(location.search).has('sourceWindow');
async function targetTab() {
  const query = detached ? {active: true, windowId: sourceWindow} : {active: true, currentWindow: true};
  const [tab] = await chrome.tabs.query(query);
  if (!tab?.id) throw Error('Open a textbook or question tab in the original browser window.');
  return tab;
}
const windowButton = document.querySelector('#openWindow');
if (detached) {
  windowButton.textContent = 'Window is detached';
  windowButton.disabled = true;
  document.querySelector('.intro').textContent = 'Controls the active tab in your original browser window. Keep this window open beside MindTap.';
}
windowButton.addEventListener('click', async () => {
  try {
    const tab = await targetTab();
    await chrome.windows.create({url: chrome.runtime.getURL('popup.html') + '?sourceWindow=' + tab.windowId,
      type: 'popup', width: 420, height: 760});
    window.close();
  } catch (error) { status.textContent = error.message; }
});
async function command(action) {
  try {
    const tab = await targetTab();
    if (action === 'chooseNext') status.textContent = 'Click the page’s Next button once. The identifying click will not advance.';
    const result = await chrome.runtime.sendMessage({action, tabId: tab.id,
      auto: document.querySelector('#auto').checked});
    status.textContent = result.error || result.message;
  } catch (error) { status.textContent = error.message; }
}
for (const action of ['analyze', 'apply', 'next', 'chooseNext', 'stop']) {
  document.querySelector(`#${action}`).addEventListener('click', () => command(action));
}
chrome.storage.local.get('status').then(result => { if (result.status) status.textContent = result.status; });
chrome.storage.onChanged.addListener(changes => { if (changes.status) status.textContent = changes.status.newValue; });

const textbookToggle = document.querySelector('#autoSaveTextbook');
const textbookStatus = document.querySelector('#textbookStatus');
chrome.storage.local.get(['autoSaveTextbook', 'textbookSaveStatus']).then(settings => {
  textbookToggle.checked = settings.autoSaveTextbook !== false;
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
  if (changes.autoSaveTextbook) textbookToggle.checked = changes.autoSaveTextbook.newValue !== false;
});

document.querySelector('#clearTextbook').addEventListener('click', async () => {
  try {
    const result = await chrome.runtime.sendMessage({action: 'clearTextbook'});
    textbookStatus.textContent = result.error || result.message;
  } catch (error) { textbookStatus.textContent = error.message; }
});
