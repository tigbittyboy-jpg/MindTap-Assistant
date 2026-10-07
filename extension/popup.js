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
for (const action of ['analyze', 'apply', 'next', 'chooseNext', 'stop']) {
  document.querySelector(`#${action}`).addEventListener('click', () => command(action));
}
chrome.storage.local.get('status').then(result => { if (result.status) status.textContent = result.status; });
chrome.storage.onChanged.addListener(changes => { if (changes.status) status.textContent = changes.status.newValue; });
