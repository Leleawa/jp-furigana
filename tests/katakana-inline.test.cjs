'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
globalThis.__FURIGANA_DICT_LOADER__=p=>fs.promises.readFile(p).then(b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
globalThis.__FURIGANA_PLUS_DICT_LOADER__=globalThis.__FURIGANA_DICT_LOADER__;
const kuromoji=require('../src/kuromoji.js'),core=require('../src/furigana.js'),external=require('../src/external-core.js'),edits=require('../src/user-edits.js');
const {install}=require('../src/editor.js');
const rows=[
 ['君の好きな旋律（メロディ）','君の好きな旋律','旋律','メロディ','ki mi no su ki na se n ri tsu'],
 ['風琴（ハーモニカ）','風琴','風琴','ハーモニカ','fu u ki n'],
 ['窓枠の画布（トワレ）','窓枠の画布','画布','トワレ','ma do wa ku no ga fu'],
 ['風景画（ペサージュ）','風景画','風景画','ペサージュ','fu u ke i ga'],
 ['少女（モニカ）','少女','少女','モニカ','sho u jo'],
 ['愛（ラブ）','愛','愛','ラブ','a i'],
 ['旋律 ( ﾒﾛﾃﾞｨ )','旋律','旋律','メロディ','se n ri tsu'],
];
const joined=s=>s.map(p=>p.text).join(''),visible=s=>s.filter(p=>!p.hidden).map(p=>p.text).join('');
kuromoji.builder({dicPath:path.resolve(__dirname,'../src/dict')}).build(async(error,tokenizer)=>{
 try {
  if(error)throw error;
  const dict=(text,mode='hiragana',raw=false)=>core.segmentsFromDictionary(tokenizer,text,{kana:mode,inlineRuby:!raw});
  for(const [text,plain,word,reading,romaji] of rows)for(const mode of ['hiragana','katakana']) {
   const verify=(segments,label)=>{assert(segments,label);assert.equal(joined(segments),text);assert.equal(visible(segments),plain);
    const ruby=segments.find(s=>s.text===word);assert.equal(ruby?.rt,reading,label+' preserves the written katakana even in hiragana mode');assert.equal(ruby.inlineKana,'katakana');
    for(const s of segments)if(s.rt&&s.at!==undefined)assert.equal(text.slice(s.at,s.at+s.text.length),s.text);
   };
   const proof=dict(text,mode,true);verify(dict(text,mode),'Dictionary');
   verify(core.segmentsFromReading(text,core.romajiToKana(romaji),proof,{kana:mode}),'Official');
   assert.equal(core.romajiForLine(new Map([[core.lyricKey(plain),romaji]]),text,proof),romaji);
   const record={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/test/',title:'試験曲',artists:['試験歌手'],lines:[{text:plain,segments:dict(plain,mode,true)}]},snapshot=JSON.stringify(record);
   const result=external.segmentsFor(text,external.prepare(record),mode,null,{proofSegments:proof,reading:core.romajiToKana(romaji)});verify(result,'Website');assert.equal(JSON.stringify(record),snapshot);
   const base=edits.annotate(record,text,result,mode),anchor=base.find(s=>s.text===word).edit;
   assert.equal(anchor.original,core.toHiragana(reading));assert.equal(anchor.displayOriginal,reading);assert.equal(anchor.displayReading,reading);
   const changed=edits.update(record,anchor,'ふし'),custom=edits.annotate(changed,text,result,mode),edited=custom.find(s=>s.text===word);
   assert.equal(edited.rt,mode==='katakana'?'フシ':'ふし');assert.equal(edited.originalRt,reading);
   assert.equal(edited.edit.displayOriginal,reading);assert.equal(edited.edit.displayReading,'ふし','The editor retains the entered spelling');
   for(const key of ['inline','displayOriginal','displayReading','inlineKana'])assert(!(key in changed.userEdits[0]),'Display markers are not stored');
   const reset=edits.update(changed,edited.edit,null);assert.equal(edits.annotate(reset,text,result,mode).find(s=>s.text===word).rt,reading);
  }
  for(const text of ['君の声（ラララ）','風の声（オー）','信じた約束は遠く（遠く）','君（きみと）歌う'])assert.equal(visible(dict(text)),text,'Keep backing lyrics: '+text);
  const echo='夢（ユメ）を見る',echoResult=core.segmentsFromReading(echo,core.romajiToKana('yu me yu me wo mi ru'),dict(echo,'hiragana',true));assert.equal(visible(echoResult),echo);
  const mixture=dict('君の旋律（メロディ）');assert(mixture.some(s=>s.text==='君'&&s.rt==='きみ'),'Ordinary readings still follow the global hiragana setting');
  const dom=new JSDOM('<body><span class="fg-ruby" data-fg-editable>旋律</span></body>',{pretendToBeVisual:true});
  try {
   const doc=dom.window.document,holder=doc.querySelector('.fg-ruby');
   holder.__fgEdit={songId:'1',provider:'local',url:'',line:'旋律（メロディ）',start:0,text:'旋律',original:'めろでぃ',reading:'めろでぃ',displayOriginal:'メロディ',displayReading:'メロディ'};
   const saves=[],editor=install({songId:()=> '1',save:async(a,r)=>saves.push(r),changed(){}},doc);editor.setEnabled(true);
   holder.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
   assert.equal(doc.querySelector('[data-reading]').value,'メロディ');assert.equal(doc.querySelector('[data-original]').value,'メロディ');
   assert(editor.setEnabled(false),'An untouched katakana input is not considered unsaved');assert.equal(saves.length,0);editor.destroy();
  }finally{dom.window.close();}
  console.log('Katakana inline passed: semantic loanword readings, full/half-width forms, multi-token kanji, both global kana modes, dictionary/official/website priority, manual override/restore, editor display, unchanged JSON/offsets, backings and echoes.');
 }catch(e){console.error(e);process.exitCode=1;}
});
