const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../extension/popup.html'),'utf8');
const source=fs.readFileSync(require('node:path').join(__dirname,'../extension/popup.js'),'utf8');
async function harness(search='', initialSettings={}) {
 const w=new JSDOM(html,{runScripts:'outside-only',url:'https://extension.test/popup.html'+search}).window;
 const queries=[],messages=[],windows=[],storageListeners=[];
 let active=false;const settings={...initialSettings};let tab={id:42,windowId:7};
 w.chrome={tabs:{query:async query=>{queries.push(query);return tab?[tab]:[];}},
  runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async message=>{if(message.action==='getAutomationState') return {active};messages.push(message);if(message.action==='setAssistanceMode'){settings.assistanceMode=message.mode;active=false;}if(message.action==='analyze' && message.auto) active=true;if(message.action==='stop') active=false;return {message:'Done'};}},
  windows:{create:async options=>{windows.push(options);}},
  storage:{local:{get:async()=>settings,set:async values=>Object.assign(settings,values)},onChanged:{addListener:callback=>storageListeners.push(callback)}}};
 let closed=false;w.close=()=>closed=true;
 w.eval(source);await new Promise(setImmediate);
 return {w,queries,messages,windows,
 change(changes){storageListeners.forEach(callback=>callback(changes,'local'));},get closed(){return closed;},setTab(value){tab=value;},
 async click(id){w.document.querySelector('#'+id).click();await new Promise(setImmediate);}};
}
test('Open in window uses the original browser window and removes manual textbook saving',async()=>{
 const app=await harness();
 assert.equal(app.w.document.querySelector('#saveTextbook'),null);
 assert.equal(app.w.document.querySelector('#chooseNext'),null);
 assert.equal(app.w.document.querySelector('#autoSaveTextbook').checked,true);
 await app.click('openWindow');
 assert.equal(app.windows[0].url,'chrome-extension://test/popup.html?sourceWindow=7');
 assert.equal(app.windows[0].type,'popup');assert.equal(app.closed,true);
});
test('detached controls follow the original window active tab, not the assistant tab',async()=>{
 const app=await harness('?sourceWindow=7');
 await app.click('analyze');
 assert.equal(app.queries[0].windowId,7);
 assert.equal(app.queries[0].currentWindow,undefined);
 assert.equal(app.messages[0].tabId,42);
 app.setTab({id:84,windowId:7});await app.click('next');
 assert.equal(app.messages[1].tabId,84);
 assert.equal(app.w.document.querySelector('#openWindow').disabled,true);
});
test('closed original window produces a helpful error without sending actions',async()=>{
 const app=await harness('?sourceWindow=7');app.setTab(null);await app.click('analyze');
 assert.equal(app.messages.length,0);
 assert.match(app.w.document.querySelector('#status').textContent,/original browser window/);
});

test('detached window displays live textbook progress and saved archive usage',async()=>{
 const app=await harness('?sourceWindow=7');
 assert.match(app.w.document.querySelector('#textbookWatcher').textContent,/Refresh the textbook tab/);
 app.change({textbookWatcherStatus:{newValue:'Saving section: Tubing…'}});
 assert.equal(app.w.document.querySelector('#textbookWatcher').textContent,'Saving section: Tubing…');
 app.change({textbookSaveStatus:{newValue:'Saved: Tubing\n3 sections · 0.04 MB of 10 MB used.'}});
 assert.match(app.w.document.querySelector('#textbookStatus').textContent,/3 sections/);
 app.change({autoSaveTextbook:{newValue:false}});
 assert.equal(app.w.document.querySelector('#textbookWatcher').textContent,'Auto-save is off.');
});

test('one automation switch starts, stops without a target tab, and syncs completion',async()=>{
 const app=await harness('?sourceWindow=7');
 assert.equal(app.w.document.querySelector('#stop'),null);
 const toggle=app.w.document.querySelector('#auto');
 toggle.checked=true;toggle.dispatchEvent(new app.w.Event('change'));await new Promise(setImmediate);
 assert.equal(app.messages[0].action,'analyze');assert.equal(app.messages[0].auto,true);
 assert.equal(app.messages[0].tabId,42);assert.equal(toggle.checked,true);
 assert.equal(app.w.document.querySelector('#automationLabel').textContent,'On');
 app.setTab(null);toggle.checked=false;toggle.dispatchEvent(new app.w.Event('change'));await new Promise(setImmediate);
 assert.equal(app.messages[1].action,'stop');assert.equal(toggle.checked,false);
 app.change({automationActive:{newValue:true}});assert.equal(toggle.checked,true);
 app.change({automationActive:{newValue:false}});assert.equal(toggle.checked,false);
 assert.equal(app.w.document.querySelector('#automationLabel').textContent,'Off');
});

test('missing detached-window reply shows recovery instructions instead of a TypeError',async()=>{
 const app=await harness('?sourceWindow=7');
 app.w.chrome.runtime.sendMessage=async()=>undefined;
 await app.click('analyze');
 assert.match(app.w.document.querySelector('#status').textContent,/No reply from the extension/);
 assert.ok(!app.w.document.querySelector('#status').textContent.includes("reading 'error'"));
 await app.click('clearTextbook');
 assert.match(app.w.document.querySelector('#textbookStatus').textContent,/Reload it in Chrome/);
 const toggle=app.w.document.querySelector('#auto');toggle.checked=true;
 toggle.dispatchEvent(new app.w.Event('change'));await new Promise(setImmediate);
 assert.equal(toggle.checked,false);assert.equal(toggle.disabled,false);
});

test('textbook mode persists in detached UI and disables AI controls', async () => {
 const app=await harness('?sourceWindow=7',{assistanceMode:'textbook'});
 assert.equal(app.w.document.querySelector('#assistanceMode').value,'textbook');
 assert.equal(app.w.document.querySelector('#analyze').textContent,'Find textbook passages');
 for (const id of ['apply','next']) assert.equal(app.w.document.querySelector('#'+id).hidden,true);
 for(const id of ['apply','next','auto']) assert.equal(app.w.document.querySelector('#'+id).disabled,true);
 assert.match(app.w.document.querySelector('.intro').textContent,/No AI, Ollama, or backend/);
 await app.click('analyze');
 assert.equal(app.messages[0].auto,false);
 app.change({assistanceMode:{newValue:'ai'}});
 assert.equal(app.w.document.querySelector('#apply').disabled,false);
 for (const id of ['apply','next']) assert.equal(app.w.document.querySelector('#'+id).hidden,false);
 assert.equal(app.w.document.querySelector('#analyze').textContent,'Analyze question');
});
test('mode selector saves preference without needing an active question tab', async () => {
 const app=await harness();app.setTab(null);
 const select=app.w.document.querySelector('#assistanceMode');
 select.value='textbook';select.dispatchEvent(new app.w.Event('change'));await new Promise(setImmediate);
 assert.equal(app.messages[0].action,'setAssistanceMode');
 assert.equal(app.messages[0].mode,'textbook');
 assert.equal(app.w.document.querySelector('#auto').disabled,true);
 assert.equal(select.disabled,false);
});
