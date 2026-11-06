'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
globalThis.__FURIGANA_DICT_LOADER__=p=>fs.promises.readFile(p).then(b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
globalThis.__FURIGANA_PLUS_DICT_LOADER__=globalThis.__FURIGANA_DICT_LOADER__;
const kuromoji=require('../src/kuromoji.js'),core=require('../src/furigana.js'),external=require('../src/external-core.js'),edits=require('../src/user-edits.js');
const {create}=require('../src/external.js');
const joined=s=>s.map(p=>p.text).join(''),visible=s=>s.filter(p=>!p.hidden).map(p=>p.text).join('');
kuromoji.builder({dicPath:path.resolve(__dirname,'../src/dict')}).build(async(error,tokenizer)=>{
 try {
  if(error)throw error;
  const dictionary=(text,kana='hiragana',raw=false)=>core.segmentsFromDictionary(tokenizer,text,{kana,inlineRuby:!raw});
  const text='切れた赤い糸 結（む）すんで',plain='切れた赤い糸 結すんで',romaji='ki re ta a ka i i to ke tsu su n de';
  const proof=dictionary(text,'hiragana',true);
  const check=(segments,mode,label)=>{
   assert(segments,label);assert.equal(joined(segments),text);assert.equal(visible(segments),plain,label);
   assert(segments.some(s=>s.text==='結'&&s.rt===(mode==='katakana'?'ム':'む')),label+' uses the original inline reading');
   for(const s of segments)if(s.rt&&s.at!==undefined)assert.equal(text.slice(s.at,s.at+s.text.length),s.text);
  };
  for(const mode of ['hiragana','katakana']) {
   check(dictionary(text,mode),mode,'Dictionary mode');
   check(core.segmentsFromReading(text,core.romajiToKana(romaji),dictionary(text,mode,true),{kana:mode}),mode,'Conflicting official romaji');
   const record={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/test/',lines:[{text:plain,segments:dictionary(plain,'hiragana',true).map(s=>s.text==='結'?{...s,rt:'けつ'}:s)}]},snapshot=JSON.stringify(record.lines);
   const result=external.segmentsFor(text,external.prepare(record),mode,null,{proofSegments:proof,reading:core.romajiToKana(romaji)});check(result,mode,'Conflicting website reading');
   for(const provider of ['local','utaten']) {
    const base={...record,provider,url:provider==='local'?'':record.url,userEdits:[]};
    const annotated=edits.annotate(base,text,result,mode),anchor=annotated.find(s=>s.text==='結').edit;
    assert.equal(anchor.original,'む');assert.equal(anchor.start,text.indexOf('結'));
    const changed=edits.update(base,anchor,'むう'),custom=edits.annotate(changed,text,result,mode);
    assert(custom.some(s=>s.text==='結'&&s.rt===(mode==='katakana'?'ムウ':'むう')),'Manual reading has the highest priority');
    const restored=edits.update(changed,anchor,null),back=edits.annotate(restored,text,result,mode);
    assert(back.some(s=>s.text==='結'&&s.rt===(mode==='katakana'?'ム':'む')),'Restoring uses original inline reading, not website or dictionary');
    const {inline,...oldAnchor}=anchor;
    const legacy={...base,userEdits:[{...oldAnchor,original:'ゆい',reading:'おり'}]};
    const legacyWord=edits.annotate(legacy,text,result,mode).find(s=>s.text==='結');
    assert.equal(legacyWord.rt,mode==='katakana'?'オリ':'おり','Existing manual edits still win after recognizing an original note');
    assert.equal(legacyWord.edit.original,'む');assert.equal(legacyWord.originalRt,mode==='katakana'?'ム':'む');
    const saved=edits.update(legacy,legacyWord.edit,'むむ');assert.equal(saved.userEdits.length,1);assert(!('inline' in saved.userEdits[0]),'No runtime marker is persisted in JSON');
    const reset=edits.update(legacy,legacyWord.edit,null);assert.equal(reset.userEdits.length,0);
   }
   assert.equal(JSON.stringify(record.lines),snapshot);
  }
  const unannotated=core.segmentsFromReading('結すんで',core.romajiToKana('ke tsu su n de'),dictionary('結すんで','hiragana',true));
  assert(unannotated.some(s=>s.text==='結'&&s.rt==='けつ'),'Without inline notes the selected official reading still applies');
  const merged={provider:'utaten',lines:[{text:'糸 結すんで',segments:[{text:'糸 結',rt:'いとけつ'},{text:'すんで'}]}]};
  assert.equal(external.segmentsFor('糸 結（む）すんで',external.prepare(merged),'hiragana',null,{proofSegments:dictionary('糸 結（む）すんで','hiragana',true)}),null,'An unsplittable website ruby must fall back instead of overriding the original note');
  for(const note of ['(む)','（ む ）',' (む) ']) {
   const line='結'+note+'すんで',result=dictionary(line);assert.equal(joined(result),line);
   assert(result.some(s=>s.text==='結'&&s.rt==='む'));assert(!visible(result).includes('む'));
  }
  for(const text of ['光（ああ）を抱く','光（ああ）まだ','君（きみと）歌う','信じた約束は遠く（遠く）']) {
   assert.equal(visible(dictionary(text)),text,'Backings and uncertain parentheses remain visible: '+text);
  }
  const echo='空(そら)を見る',echoResult=core.segmentsFromReading(echo,core.romajiToKana('so ra so ra wo mi ru'),dictionary(echo,'hiragana',true));
  assert.equal(visible(echoResult),echo,'Explicit repeat evidence remains a chorus');
  for(const provider of ['local','utaten']) {
   const url=provider==='local'?'':'https://utaten.com/lyric/test/',record={schema:1,songId:'1',provider,url,title:'試験曲',artists:['試験歌手'],lines:provider==='local'?[]:[{text:plain,segments:dictionary(plain,'hiragana',true)}],userEdits:[{provider,url,line:text,start:text.indexOf('結'),text:'結',original:'ゆい',reading:'おり'}]};
   const file='C:/Test/lyrics/jp-furigana/1.json',files=new Map([[file,JSON.stringify(record)]]);
   const client=create({dataRoot:async()=>'C:/Test',proofSegments:t=>dictionary(t,'hiragana',true),reading:()=>core.romajiToKana(romaji),
    fs:{mkdir:async()=>true,exists:async p=>files.has(p),readFileText:async p=>files.get(p),atomicWrite:async(p,value,expected)=>{assert.equal(files.get(p),expected);files.set(p,value);}},
    request:async()=>{throw Error('No request expected');}});
   if(provider==='local')await client.ensureLocal('1',async()=>({title:record.title,artists:record.artists}),{});
   else await client.load('1',async()=>{throw Error('Cached metadata only');},{externalProvider:'utaten'});
   const result=()=>provider==='local'?client.fallbackSegments(text,dictionary(text),'hiragana'):client.segments(text,'hiragana');
   const word=result().find(s=>s.text==='結');assert.equal(word.rt,'おり');assert.equal(word.edit.original,'む');
   await client.saveEdit(word.edit,'むう',null,t=>dictionary(t));assert.equal(result().find(s=>s.text==='結').rt,'むう');
   await client.saveEdit(result().find(s=>s.text==='結').edit,null,null,t=>dictionary(t));assert.equal(result().find(s=>s.text==='結').rt,'む');
   const saved=JSON.parse(files.get(file));assert.deepEqual(saved.lines,record.lines);assert.deepEqual(saved.userEdits,[]);client.stop();
  }
  console.log('Inline priority passed: manual > original annotation > official/dictionary/website, irregular interrupted words, same offsets, restore and source fields, ordinary backings and echoes.');
 }catch(e){console.error(e);process.exitCode=1;}
});
