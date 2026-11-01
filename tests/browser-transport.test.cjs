'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {browserTransport}=require('../src/external.js');
const uta='https://utaten.com/search?title=test',net='https://www.uta-net.com/search/?Keyword=test';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function response(text,url,status=200,headers={}){
 const result=new Response(text,{status,headers});Object.defineProperty(result,'url',{value:url});return result;
}
function fixture(perform,{load=true,timeout=2000}={}){
 const frames=[],calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return perform(url,options);};
 const document={body:{append(frame){frame.connected=true;if(load)queueMicrotask(()=>frame.onload?.());}},createElement(tag){
  assert.equal(tag,'iframe');const frame={style:{},attrs:{},connected:false,contentWindow:{location:{origin:'https://utaten.com'},fetch:fetcher},setAttribute(k,v){this.attrs[k]=v;},remove(){this.connected=false;this.removed=true;}};
  frames.push(frame);return frame;
 }};
 const app={getDataPath:async()=>'C:/Test'};Object.defineProperty(app,'exec',{get(){throw Error('Browser requests must not inspect or invoke app.exec');}});
 const transport=browserTransport({app,fs:{}},{},{fetch:fetcher,document,requestTimeoutMs:timeout,cancelPollMs:2});
 return{transport,frames,calls};
}
(async()=>{
 const good=fixture(async url=>response('空を見る',url));
 assert.equal(await good.transport.request(uta),'空を見る');assert.equal(good.frames.length,1);
 const frame=good.frames[0];assert.equal(frame.attrs.sandbox,'allow-same-origin');assert.equal(frame.src,'https://utaten.com/robots.txt');assert(frame.removed);
 assert(!frame.attrs.sandbox.includes('allow-scripts'));
 assert.equal(good.calls[0].options.referrer,'https://utaten.com/');
 assert.equal(good.calls[0].options.credentials,'omit');assert.equal(good.calls[0].options.redirect,'manual');
 assert(good.calls[0].options.signal.aborted,'Finished requests release their network resources');
 assert.equal(await good.transport.request(net),'空を見る');assert.equal(good.frames.length,1,'Uta-Net needs no source iframe');
 assert.equal(good.calls[1].options.referrerPolicy,'no-referrer');
 await assert.rejects(good.transport.request('https://utaten.com.evil.invalid/'),/只允许/);
 await assert.rejects(good.transport.request('file:///private'),/只允许/);assert.equal(good.calls.length,2);

 const empty=fixture(async url=>response('',url));await assert.rejects(empty.transport.request(uta),error=>/空页面/.test(error.message)&&error.retryable);assert(empty.frames[0].removed);
 const failed=fixture(async url=>response('denied',url,403));await assert.rejects(failed.transport.request(net),error=>/HTTP 403/.test(error.message)&&!error.retryable);
 const rate=fixture(async url=>response('busy',url,429,{'Retry-After':'12'}));await assert.rejects(rate.transport.request(net),error=>error.retryable&&error.retryAfterMs===12000);
 const offline=fixture(async()=>{throw new TypeError('Failed to fetch');});await assert.rejects(offline.transport.request(uta),error=>/网络连接失败/.test(error.message)&&error.retryable);assert(offline.frames[0].removed);

 const readable=fixture(async url=>url===net?response('redirect',url,302,{Location:'/moved/'}):response('移動',url));assert.equal(await readable.transport.request(net),'移動');assert.equal(readable.calls.length,2);
 const foreign=fixture(async url=>response('redirect',url,302,{Location:'https://outside.invalid/'}));await assert.rejects(foreign.transport.request(net),/超出允许范围/);assert.equal(foreign.calls.length,1);
 const opaque=fixture(async url=>{const r=response('',url);Object.defineProperty(r,'type',{value:'opaqueredirect'});return r;});await assert.rejects(opaque.transport.request(net),/无法核对.*重定向/);
 const followed=fixture(async()=>response('foreign','https://outside.invalid/'));await assert.rejects(followed.transport.request(net),/超出允许范围/);

 const large=fixture(async url=>response('x',url,200,{'Content-Length':String(2097153)}));await assert.rejects(large.transport.request(net),/响应过大/);
 let cancelledStream=false;
 const streaming=fixture(async url=>{
  let n=0;const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1048576));if(++n===4)controller.close();},cancel(){cancelledStream=true;}});
  const r=new Response(body);Object.defineProperty(r,'url',{value:url});return r;
 });
 await assert.rejects(streaming.transport.request(net),/响应过大/);assert(cancelledStream);
 const utf8=fixture(async url=>{const bytes=new TextEncoder().encode('空を見る'),r=new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,1));c.enqueue(bytes.slice(1,5));c.enqueue(bytes.slice(5));c.close();}}));Object.defineProperty(r,'url',{value:url});return r;});
 assert.equal(await utf8.transport.request(net),'空を見る');

 let cancel=false;
 const loading=fixture(async url=>response('never',url),{load:false,timeout:100});
 const waiting=loading.transport.request(uta,()=>cancel);setTimeout(()=>cancel=true,5);
 await assert.rejects(waiting,error=>/已取消/.test(error.message)&&!error.retryable);assert(loading.frames[0].removed);assert.equal(loading.calls.length,0);
 const loadTimeout=fixture(async()=>{}, {load:false,timeout:8});await assert.rejects(loadTimeout.transport.request(uta),error=>/超时/.test(error.message)&&error.retryable);assert(loadTimeout.frames[0].removed);
 const stalled=fixture(async()=>new Promise(()=>{}),{timeout:8});await assert.rejects(stalled.transport.request(net),/超时/);
 let released=false;
 const bodyTimeout=fixture(async url=>({ok:true,status:200,url,headers:new Headers(),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel(){released=true;return Promise.resolve();}})}}),{timeout:8});
 await assert.rejects(bodyTimeout.transport.request(net),/超时/);assert(released);
 let inFlight=0,max=0;
 const serial=fixture(async url=>{max=Math.max(max,++inFlight);await sleep(4);inFlight--;return response('ready',url);});
 await Promise.all([serial.transport.request(uta),serial.transport.request(net)]);assert.equal(max,1);
 let endFirst;const queued=fixture(async url=>{await new Promise(resolve=>endFirst=resolve);return response('first',url);});
 const first=queued.transport.request(net);while(!endFirst)await sleep(1);
 const second=queued.transport.request(uta,()=>true),secondRejected=assert.rejects(second,/已取消/);endFirst();await first;await secondRejected;
 assert.equal(queued.calls.length,1);assert.equal(queued.frames.length,0);
 const source=fs.readFileSync(path.resolve(__dirname,'../src/external.js'),'utf8');
 assert(!/app\.exec|EncodedCommand|powershell|curl\.exe|child_process|new Function|eval\(/i.test(source));
 console.log('Browser transport passed: inert website context, direct fetch, URL/redirect restrictions, credential-free fetch and no remote scripts, UTF-8 stream limits, timeout/cancellation in all phases, serial requests, cleanup and zero process APIs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
