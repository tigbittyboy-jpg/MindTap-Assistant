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

document.querySelector('#export').addEventListener('click', async () => {
  try {
    const {runHistory = []} = await chrome.storage.session.get('runHistory');
    if (!runHistory.length) { status.textContent = 'No questions recorded yet. Analyze a question first.'; return; }
    const blob = new Blob([JSON.stringify({version: 1, questions: runHistory}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mindtap-run.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Exported recent questions, suggestions, and selection checks. No answer key is included.';
  } catch (error) { status.textContent = error.message; }
});
