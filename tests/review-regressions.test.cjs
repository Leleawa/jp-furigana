'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {create}=require('../src/external.js');
const settings={externalProvider:'utaten',externalAutoRetry:'off'}, metadata=async()=>({title:'試験曲',artists:['試験歌手']});
const search='<table><tr><td class="searchResult__title"><a href="/lyric/test/">試験曲</a></td><td class="searchResult__artist"><p><a>試験歌手</a></p></td></tr></table>';
const song='<h2 class="newLyricTitle__main">試験曲</h2><h3><a href="/artist/1/">試験歌手</a></h3><div class="lyricBody"><div class="hiragana"><span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>をみる</div></div>';
const file='C:/Test/lyrics/jp-furigana/1.json';
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}throw Error('Review regression timed out');}
function fixture(){
 const files=new Map(),calls=[],invalidations=[];let hold=true,release,removed=true,cancelled;
 const client=create({dataRoot:async()=>'C:/Test',parse:html=>new JSDOM(html).window.document,request:async(url,isCancelled)=>{
  calls.push(url);cancelled=isCancelled;if(hold){hold=false;await new Promise(r=>release=r);}return url.includes('/search')?search:song;
 },fs:{mkdir:async()=>true,exists:async p=>files.has(p),readFileText:async p=>files.get(p),writeFileText:async(p,v)=>{files.set(p,v);return true;},remove:async p=>removed&&files.delete(p)},onInvalidated:id=>invalidations.push(id)});
 return{client,files,calls,invalidations,release:()=>release(),isCancelled:()=>cancelled(),failDelete:()=>removed=false};
}
(async()=>{
 const normal=fixture(),request=normal.client.load('1',metadata,settings);await until(()=>normal.calls.length);
 await assert.rejects(normal.client.ensureLocal('1',metadata,settings),/正在获取网站注音/);
 assert(normal.client.inspect().loading);assert.equal(normal.isCancelled(),false,'An accidental ensureLocal must not invalidate the request');
 normal.release();await request;assert.equal(normal.client.inspect().source,'utaten');
 const cancelled=fixture(),old=cancelled.client.load('1',metadata,settings);await until(()=>cancelled.calls.length);
 assert(cancelled.client.cancelFetch());assert.equal(cancelled.isCancelled(),true);assert(!cancelled.client.inspect().loading);
 await cancelled.client.ensureLocal('1',metadata,settings);
 const fallback=()=>[{text:'空',rt:'そら',at:0},{text:'をみる'}],anchor=cancelled.client.fallbackSegments('空をみる',fallback(),'hiragana')[0].edit;
 await cancelled.client.saveEdit(anchor,'うみ',null,fallback);cancelled.release();await old;
 let record=JSON.parse(cancelled.files.get(file));assert.equal(record.provider,'local');assert.deepEqual(record.lines,[]);assert.equal(record.userEdits[0].reading,'うみ');
 await cancelled.client.load('1',metadata,settings);record=JSON.parse(cancelled.files.get(file));
 assert.equal(record.provider,'utaten');assert(record.lines.length);assert.equal(record.userEdits[0].reading,'うみ','First website retrieval preserves independent user edits');assert.equal(cancelled.files.size,1);
 await cancelled.client.manage('1',settings,'delete');assert.equal(cancelled.files.size,0);assert.deepEqual(cancelled.invalidations,['1']);assert.match(cancelled.client.inspect().status,/缓存已删除/);assert(!cancelled.client.inspect().status.includes('未启用'));
 const protectedCache=fixture(),loaded=protectedCache.client.load('1',metadata,settings);await until(()=>protectedCache.calls.length);protectedCache.release();await loaded;
 protectedCache.failDelete();await assert.rejects(protectedCache.client.manage('1',settings,'delete'),/删除失败/);assert(protectedCache.client.inspect().ready);assert.equal(protectedCache.client.inspect().source,'utaten');assert.equal(protectedCache.invalidations.length,0);
 console.log('Review regressions passed: safe edit guards, explicit cancellation, independent local corrections, later website fetch, one JSON, deletion state/invalidation and failed-delete preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
