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
    const result = await chrome.runtime.sendMessage({action, tabId: tab.id,
      auto: false});
    status.textContent = result.error || result.message;
  } catch (error) { status.textContent = error.message; }
}
for (const action of ['analyze', 'apply', 'next']) {
  document.querySelector(`#${action}`).addEventListener('click', () => command(action));
}
chrome.storage.local.get('status').then(result => { if (result.status) status.textContent = result.status; });
chrome.storage.onChanged.addListener(changes => { if (changes.status) status.textContent = changes.status.newValue; });

const automationToggle = document.querySelector('#auto');
const automationLabel = document.querySelector('#automationLabel');
function showAutomation(active) {
  automationToggle.checked = active === true;
  automationLabel.textContent = active ? 'On' : 'Off';
}
async function refreshAutomation() {
  const result = await chrome.runtime.sendMessage({action: 'getAutomationState'});
  showAutomation(result.active);
}
void refreshAutomation().catch(error => { status.textContent = error.message; });
automationToggle.addEventListener('change', async () => {
  automationToggle.disabled = true;
  try {
    const enabled = automationToggle.checked;
    const request = enabled ? {action: 'analyze', tabId: (await targetTab()).id, auto: true} : {action: 'stop'};
    const result = await chrome.runtime.sendMessage(request);
    status.textContent = result.error || result.message;
    if (result.error) await refreshAutomation();
    else await refreshAutomation();
  } catch (error) {
    showAutomation(false);
    status.textContent = error.message;
  } finally { automationToggle.disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.automationActive) showAutomation(changes.automationActive.newValue);
});

const textbookToggle = document.querySelector('#autoSaveTextbook');
const textbookStatus = document.querySelector('#textbookStatus');
const textbookWatcher = document.querySelector('#textbookWatcher');
chrome.storage.local.get(['autoSaveTextbook', 'textbookSaveStatus', 'textbookWatcherStatus']).then(settings => {
  textbookToggle.checked = settings.autoSaveTextbook !== false;
  textbookStatus.textContent = settings.textbookSaveStatus || 'No sections saved yet. 0 MB of 10 MB used.';
  textbookWatcher.textContent = textbookToggle.checked ? (settings.textbookWatcherStatus || 'Reader not detected yet. Refresh the textbook tab to start auto-save.') : 'Auto-save is off.';
});
textbookToggle.addEventListener('change', async () => {
  try {
    await chrome.storage.local.set({autoSaveTextbook: textbookToggle.checked});
    textbookWatcher.textContent = textbookToggle.checked ? 'Auto-save is on. Open a textbook section.' : 'Textbook auto-save is off.';
  } catch (error) { textbookStatus.textContent = error.message; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.textbookWatcherStatus) textbookWatcher.textContent = changes.textbookWatcherStatus.newValue;
  if (changes.textbookSaveStatus) textbookStatus.textContent = changes.textbookSaveStatus.newValue;
  if (changes.autoSaveTextbook) {
    textbookToggle.checked = changes.autoSaveTextbook.newValue !== false;
    if (!textbookToggle.checked) textbookWatcher.textContent = 'Auto-save is off.';
  }
});

document.querySelector('#clearTextbook').addEventListener('click', async () => {
  try {
    const result = await chrome.runtime.sendMessage({action: 'clearTextbook'});
    textbookStatus.textContent = result.error || result.message;
  } catch (error) { textbookStatus.textContent = error.message; }
});
