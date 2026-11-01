'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),dialog=require('../src/source-dialog.js'),core=require('../src/external-core.js');
(async()=>{
 const dom=new JSDOM('<body><button id="open">打开</button></body>',{pretendToBeVisual:true}),doc=dom.window.document;let songId='1';const api={trackId:()=>songId,validate:core.utatenURL,url:'https://utaten.com/lyric/one/'};
 doc.getElementById('open').focus();const first=dialog.open(api,doc);assert.equal(dialog.open(api,doc),first);assert.equal(doc.querySelectorAll('[role=dialog]').length,1);
 let form=doc.querySelector('form'),input=form.querySelector('input');assert.equal(doc.activeElement,input);input.value='https://evil.test/lyric/a/';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));assert(form.querySelector('[role=alert]').textContent.includes('UtaTen'));assert(form.isConnected);
 input.value='https://www.utaten.com/lyric/chosen/?utm=test';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));assert.deepEqual(await first,{songId:'1',url:'https://utaten.com/lyric/chosen/'});assert.equal(doc.activeElement.id,'open');
 const clear=dialog.open(api,doc);form=doc.querySelector('form');form.querySelector('input').value='';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));assert.deepEqual(await clear,{songId:'1',url:null});
 const changed=dialog.open(api,doc);songId='2';form=doc.querySelector('form');form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));assert(form.querySelector('[role=alert]').textContent.includes('歌曲已变化'));form.querySelector('[data-cancel]').click();assert.equal(await changed,null);
 const escaped=dialog.open(api,doc);doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(await escaped,null);assert(!doc.querySelector('[role=dialog]'));assert.equal(doc.querySelectorAll('#fg-source-dialog-style').length,1);
 dom.window.close();console.log('Source dialog passed: focus, duplicate prevention, URL validation, canonical submit, reset, cancellation, song changes and cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
