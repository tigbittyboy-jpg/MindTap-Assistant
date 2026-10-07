const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../extension/popup.html'),'utf8');
const source=fs.readFileSync(require('node:path').join(__dirname,'../extension/popup.js'),'utf8');
async function harness(search='') {
 const w=new JSDOM(html,{runScripts:'outside-only',url:'https://extension.test/popup.html'+search}).window;
 const queries=[],messages=[],windows=[],storageListeners=[];
 const settings={};let tab={id:42,windowId:7};
 w.chrome={tabs:{query:async query=>{queries.push(query);return tab?[tab]:[];}},
  runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async message=>{messages.push(message);return {message:'Done'};}},
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
