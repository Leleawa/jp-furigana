'use strict';
const assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const core=require('../src/external-core.js'),{create}=require('../src/external.js'),edits=require('../src/user-edits.js');
const dom=new JSDOM(''),parse=html=>new dom.window.DOMParser().parseFromString(html,'text/html');
const line='静かな夜に旋律が響く',url='https://utaten.com/lyric/test/';
const html='<h2 class="newLyricTitle__main">試験曲</h2><h3><a href="/artist/1">試験歌手</a></h3><div class="lyricBody"><div class="hiragana">静かな夜に<span class="ruby"><span class="rb">旋律</span><span class="rt">メロディ</span></span>が<ruby><rb>響</rb><rt>ひび</rt></ruby>く</div></div>';
const metadata=async()=>({title:'試験曲',artists:['試験歌手']}),settings={externalProvider:'utaten'};
const search='<table><tr><td class="searchResult__title"><a href="/lyric/test/">試験曲</a></td><td class="searchResult__artist"><p><a>試験歌手</a></p></td></tr></table>';
const path='C:/Test/lyrics/jp-furigana/1.json',files=new Map();let requests=0;
function client() { return create({dataRoot:async()=> 'C:/Test',parse,
 fs:{mkdir:async()=>true,exists:async p=>files.has(p),readFileText:async p=>files.get(p),
  atomicWrite:async(p,next,expected)=>{assert.equal(files.get(p)??null,expected);files.set(p,next);}},
 request:async address=>{requests++;return address.includes('/search')?search:html;}}); }
const ruby=(segments,text)=>segments.find(s=>s.text===text);
(async()=>{
 const parsed=core.parseUtaten(parse(html),url),snapshot=JSON.stringify(parsed),groups=core.prepare(parsed);
 assert.equal(parsed.lines[0].text,line);assert.equal(ruby(parsed.lines[0].segments,'旋律').rt,'メロディ');
 assert.equal(ruby(parsed.lines[0].segments,'響').rt,'ひび');
 for(const mode of ['hiragana','katakana']) {
  for(const target of [line,'夜に旋律が響く','静かな夜に旋律が轟く']) {
   const segments=core.segmentsFor(target,groups,mode);
   assert(segments,target);assert.equal(segments.map(s=>s.text).join(''),target);
   assert.equal(ruby(segments,'旋律')?.rt,'メロディ','Exact, sliced and spelling-aligned website readings retain katakana');
   assert.equal(ruby(segments,target.includes('轟')?'轟':'響')?.rt,mode==='katakana'?'ヒビ':'ひび');
  }
 }
 assert.equal(JSON.stringify(parsed),snapshot,'Display conversion cannot mutate the source');
 assert.equal(core.kana('メロディ','hiragana'),'めろでぃ','Canonical identity keys remain compatible');
 assert.equal(core.writtenKana('ひかりメロディ','hiragana'),'ひかりメロディ');
 let c=client();await c.load('1',metadata,settings);assert.equal(requests,2);
 let stored=JSON.parse(files.get(path));assert(core.validRecord(stored,'1'));assert.equal(ruby(stored.lines[0].segments,'旋律').rt,'メロディ');
 const siteLines=JSON.stringify(stored.lines),get=()=>ruby(c.segments(line,'hiragana'),'旋律');
 assert.equal(get().rt,'メロディ');assert.equal(get().edit.displayOriginal,'メロディ');
 await c.saveEdit(get().edit,'ｳﾀ');stored=JSON.parse(files.get(path));
 assert.equal(stored.userEdits[0].reading,'ウタ');assert.equal(get().rt,'ウタ');assert.equal(get().originalRt,'メロディ');
 for(const field of ['inline','inlineKana','displayOriginal','displayReading'])assert(!(field in stored.userEdits[0]));
 c.stop();c=client();await c.load('1',metadata,settings);assert.equal(requests,2,'Reload uses the cache');assert.equal(get().rt,'ウタ');
 assert.equal(ruby(c.segments(line,'katakana'),'旋律').rt,'ウタ');
 const stale=get().edit;await c.saveEdit(stale,'うた');assert.equal(get().rt,'うた');
 await assert.rejects(c.saveEdit(stale,'ほし'),/本地读音已变化/,'Script-only concurrent changes still invalidate an old editor');
 await c.saveEdit(get().edit,null);assert.equal(get().rt,'メロディ');
 await c.saveEdit(get().edit,'メロディ');assert.equal(JSON.parse(files.get(path)).userEdits.length,0,'Unchanged written katakana does not add an override');
 const hira=ruby(c.segments(line,'hiragana'),'響');await c.saveEdit(hira.edit,'ヒビ');
 assert.equal(ruby(c.segments(line,'hiragana'),'響').rt,'ヒビ','A script-only manual correction is meaningful');
 assert.equal(JSON.parse(files.get(path)).userEdits[0].reading,'ヒビ');
 await c.load('1',metadata,settings,true);assert.equal(requests,4);
 assert.equal(ruby(c.segments(line,'hiragana'),'響').rt,'ヒビ','Refetch preserves the exact manual script');
 assert.equal(JSON.stringify(JSON.parse(files.get(path)).lines),siteLines,'Manual edits do not rewrite website fields');
 await c.saveEdit(ruby(c.segments(line,'hiragana'),'響').edit,null);assert.equal(ruby(c.segments(line,'hiragana'),'響').rt,'ひび');c.stop();
 // Existing hiragana-only records cannot reveal whether an old parser discarded katakana.
 const old={...parsed,schema:1,songId:'1',lines:parsed.lines.map(l=>({...l,segments:l.segments.map(s=>s.rt?{...s,rt:core.kana(s.rt,'hiragana')}:{...s})}))};
 files.set(path,JSON.stringify(old));c=client();await c.load('1',metadata,settings);assert.equal(requests,4);assert.equal(get().rt,'めろでぃ');
 await c.load('1',metadata,settings,true);assert.equal(requests,6);assert.equal(get().rt,'メロディ');c.stop();
 assert.equal(edits.reading(' ﾍﾟｻｰｼﾞｭ '),'ペサージュ');
 console.log('Katakana source passed: UtaTen parsing without inline parentheses, exact/sliced/spelling alignment, mixed scripts, download/cache reload, half-width manual edits, script-only stale checks, refetch/restore and legacy-cache refresh.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
