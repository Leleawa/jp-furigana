'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
globalThis.__FURIGANA_DICT_LOADER__=p=>fs.promises.readFile(p).then(b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const kuromoji=require('../src/kuromoji.js'),core=require('../src/furigana.js'),external=require('../src/external-core.js');
const {create}=require('../src/external.js');
const joined=s=>s.map(p=>p.text).join('');
const visible=s=>s.filter(p=>!p.hidden).map(p=>p.text).join('');
const hidden=s=>s.filter(p=>p.hidden).map(p=>p.text);
const site=segments=>({text:joined(segments),segments});
kuromoji.builder({dicPath:path.resolve(__dirname,'../src/dict')}).build(async(error,tokenizer)=>{
 try {
  if(error)throw error;
  const dict=(text,kana='hiragana',raw=false)=>core.tokensToSegments(core.tokenizeForReading(tokenizer,text),{kana,inlineRuby:!raw});
  const verify=(s,text)=>{assert(s);assert.equal(joined(s),text);for(const p of s)if(p.rt&&p.at!==undefined)assert.equal(text.slice(p.at,p.at+p.text.length),p.text);};
  const convert=(text,romaji)=>core.segmentsFromReading(text,core.romajiToKana(romaji),dict(text,'hiragana',true));
  for(const note of ['(とびら)','（とびら ）',' ( とびら )','　（　トビラ　）','\n( とびら\u00a0)','（ﾄﾋﾞﾗ）']) {
   const text='行けば戻れない 扉'+note;
   for(const mode of ['hiragana','katakana']) {
    const s=dict(text,mode);verify(s,text);assert.equal(visible(s),'行けば戻れない 扉');assert.deepEqual(hidden(s),[note]);
    assert(s.some(p=>p.text==='扉'&&p.rt===(mode==='katakana'||/[ァ-ヺｦ-ﾟ]/.test(note)?'トビラ':'とびら')));
   }
  }
  const mixed='扉 ( とびら ) の向こう（君の声）へ進む（もう一度）';
  const mixedResult=dict(mixed);verify(mixedResult,mixed);assert.deepEqual(hidden(mixedResult),[' ( とびら )']);
  assert.equal(visible(mixedResult),'扉 の向こう（君の声）へ進む（もう一度）');
  for(const word of ['君','声','一度'])assert(mixedResult.some(s=>s.text===word&&s.rt),'Chorus kanji remains annotated: '+word);
  for(const text of ['光(ああ)を抱く','君（きみと）歌う','花(わな)を見る','Hello (la la)','あした（もういちど）','扉（とびら','扉 とびら）']) {
   const s=dict(text);verify(s,text);assert.equal(visible(s),text,'Do not hide ordinary, uncertain or incomplete parentheses: '+text);
  }
  const okurigana='持ち帰る（もちかえる ）夢',okuriganaResult=dict(okurigana);verify(okuriganaResult,okurigana);assert.equal(visible(okuriganaResult),'持ち帰る夢');
  const contiguous='思春期疵口(きずぐち)胸のうち',contiguousResult=dict(contiguous);verify(contiguousResult,contiguous);
  assert.equal(core.readingBefore(contiguousResult,3,'ししゅんき'),0);assert(contiguousResult.some(p=>p.text==='疵口'&&p.rt==='きずぐち'));
  const nested='歌（君の声と星(ほし)）',nestedResult=dict(nested);verify(nestedResult,nested);assert.equal(visible(nestedResult),'歌（君の声と星）');assert.deepEqual(hidden(nestedResult),['(ほし)']);
  // The same spelling can be an actual echo: whole-line evidence wins over
  // dictionary-only notation heuristics, including when both coexist.
  const echo='星(ほし)と空(そら)をみる',echoReading='ho shi to so ra so ra wo mi ru';
  const echoResult=convert(echo,echoReading);verify(echoResult,echo);assert.equal(visible(echoResult),'星と空(そら)をみる');assert.deepEqual(hidden(echoResult),['(ほし)']);
  const prehidden=dict(echo),reconsidered=core.segmentsFromReading(echo,core.romajiToKana(echoReading),prehidden);assert.equal(visible(reconsidered),visible(echoResult),'Previously hidden dictionary notes can be restored as a sung echo');
  const ambiguous='空(そら)空(そら)',ambiguousResult=convert(ambiguous,'so ra so ra so ra');verify(ambiguousResult,ambiguous);assert.equal(visible(ambiguousResult),ambiguous,'Ambiguous note locations are retained');
  const irregular='宇宙(そら)を見る';assert.equal(visible(dict(irregular)),irregular,'Unconfirmed irregular readings remain visible without a source');
  const irregularResult=convert(irregular,'so ra wo mi ru');verify(irregularResult,irregular);assert.equal(visible(irregularResult),'宇宙を見る');assert(irregularResult.some(s=>s.text==='宇宙'&&s.rt==='そら'));
  const english='扉(とびら)で Hello',englishResult=convert(english,'to bi ra de Hello');verify(englishResult,english);assert.equal(visible(englishResult),'扉で Hello','Unknown Latin portions must not stop confirmed note cleanup');
  const unknown='鵺(ぬえ)をみる';assert.equal(visible(core.tokensToSegments([{surface_form:unknown,word_type:'UNKNOWN'}])),unknown);
  // A synthetic external page keeps its chorus, while the client's additional
  // annotation is hidden. Neither cached website text nor source readings change.
  const lyric=site([{text:'星',rt:'ほし'},{text:'と'},{text:'空',rt:'そら'},{text:'(そら)をみる'}]);
  const record={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/test/',title:'試験曲',artists:['試験歌手'],lines:[lyric]};
  const original=JSON.stringify(record),groups=external.prepare(record,[echo]);
  const options={reading:core.romajiToKana(echoReading),proofSegments:dict(echo,'hiragana',true)};
  const fromSite=external.segmentsFor(echo,groups,'hiragana',null,options);verify(fromSite,echo);assert.equal(visible(fromSite),'星と空(そら)をみる');assert.equal(JSON.stringify(record),original);
  const spaced='行けば戻れない 扉（とびら ）';
  const plainSite=site([{text:'行',rt:'い'},{text:'けば'},{text:'戻',rt:'もど'},{text:'れない '},{text:'扉',rt:'とびら'}]);
  const spacedResult=external.segmentsFor(spaced,external.prepare({provider:'utaten',lines:[plainSite]}),'hiragana');verify(spacedResult,spaced);assert.equal(visible(spacedResult),plainSite.text);
  const specialText='扉(とびら)へ',specialSite=site([{text:'扉',rt:'どあ'},{text:'へ'}]);
  const specialResult=external.segmentsFor(specialText,external.prepare({provider:'utaten',lines:[specialSite]}),'hiragana',null,{proofSegments:dict(specialText,'hiragana',true)});verify(specialResult,specialText);
  assert.equal(visible(specialResult),'扉へ');assert(specialResult.some(s=>s.text==='扉'&&s.rt==='とびら'),'The original inline reading takes priority over a conflicting website reading');
  const explicit=site([...plainSite.segments,{text:'（とびら ）'}]);
  const explicitResult=external.segmentsFor(spaced,external.prepare({provider:'utaten',lines:[explicit]}),'hiragana');verify(explicitResult,spaced);assert.equal(visible(explicitResult),plainSite.text,'Redundant notation in the website text is normalized too');
  // New reading evidence invalidates only the in-memory result. Editing uses
  // the same classification and exact original offsets as the visible line.
  let reading=core.romajiToKana('ho shi to so ra wo mi ru');const files=new Map([['C:/Test/lyrics/jp-furigana/1.json',JSON.stringify(record)]]);
  const client=create({dataRoot:async()=>'C:/Test',reading:()=>reading,proofSegments:t=>dict(t,'hiragana',true),
   fs:{mkdir:async()=>true,exists:async p=>files.has(p),readFileText:async p=>files.get(p),writeFileText:async(p,value)=>{files.set(p,value);return true;}}});
  await client.load('1',async()=>{throw Error('Cache must not request metadata');},{externalProvider:'utaten'});
  client.segments(echo,'hiragana');reading=options.reading;
  const after=client.segments(echo,'hiragana');assert.equal(visible(after),'星と空(そら)をみる');
  const edit=after.find(p=>p.text==='空').edit;await client.saveEdit(edit,'うみ');assert(client.segments(echo,'hiragana').some(p=>p.text==='空'&&p.rt==='うみ'));
  assert.deepEqual(JSON.parse([...files.values()][0]).lines,record.lines);client.stop();
  const long='星(ほし)と'.repeat(20)+'空(そら)';assert(core.inlineRubyVariants(core.inlineRubyRanges(long)).length<=64,'Unusual lines have a bounded hypothesis count');
  const start=performance.now();for(let i=0;i<200;i++)external.segmentsFor(echo,groups,'hiragana',null,options);
  console.log('Parentheses passed: whitespace/width, mixed chorus and ruby, whole-line echo evidence, irregular readings, conservative ambiguity, website/cache/edit consistency and bounded work; 200 cached-context resolutions '+Math.round(performance.now()-start)+' ms.');
 }catch(e){console.error(e);process.exitCode=1;}
});
