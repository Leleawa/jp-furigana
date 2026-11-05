'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
globalThis.__FURIGANA_DICT_LOADER__=p=>fs.promises.readFile(p).then(b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
globalThis.__FURIGANA_PLUS_DICT_LOADER__=globalThis.__FURIGANA_DICT_LOADER__;
const root=path.resolve(__dirname,'..'),src=path.join(root,'src');
const kuromoji=require('../src/kuromoji.js');
const core=require('../src/furigana.js'),external=require('../src/external-core.js');
const samples=[
 {lrc:'揺れる金魚に移る',yrc:'揺（ゆ）れる金魚に移（うつ）る',roma:'yu re ru ki n gyo ni u tsu ru',pairs:[['揺','ゆ'],['移','うつ']]},
 {lrc:'心地良く泳ぐ',yrc:'心地良（よ）く泳（およ）ぐ',roma:'ko ko chi yo ku o yo gu',pairs:[['良','よ'],['泳','およ']]},
 {lrc:'暮れる陽射し',yrc:'暮（く）れる陽射（ひざ）し',roma:'ku re ru hi za shi',pairs:[['暮','く'],['陽射','ひざ']]},
 {lrc:'何処かへ貴方連れ去ってしまうなら',yrc:'何処かへ貴方連（つ）れ去ってしまうなら',roma:'do ko ka he ki mi tsu re sa tte shi ma u na ra',pairs:[['連','つ']]},
 {lrc:'揺れる星と泳ぐ（君の声）',yrc:'揺（ゆ）れる星（ほし ）と泳（およ）ぐ（君の声）',roma:'yu re ru ho shi to o yo gu ki mi no ko e',pairs:[['揺','ゆ'],['星','ほし'],['泳','およ'],['君','きみ'],['声','こえ']]},
 {lrc:'空（そら）を見る',yrc:'空（そら）を見る',roma:'so ra so ra wo mi ru',pairs:[['空','そら']]},
 {lrc:'揺れる星と泳ぐ',yrc:'揺 （ゆ） れる星 （ほし） と泳 （およ） ぐ',visible:'揺 れる星 と泳 ぐ',roma:'yu re ru ho shi to o yo gu',pairs:[['揺','ゆ'],['星','ほし'],['泳','およ']]},
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const textOf=(node,visible=false)=>{const copy=node.cloneNode(true);for(const n of copy.querySelectorAll('.fg-rt,rt,.rnp-karaoke-word-filler'+(visible?',.fg-hide':'')))n.remove();return copy.textContent;};
kuromoji.builder({dicPath:path.join(src,'dict')}).build(async(error,tokenizer)=>{
 if(error){console.error(error);process.exitCode=1;return;}
 try {
  for(const s of samples) {
   const proof=core.segmentsFromDictionary(tokenizer,s.yrc,{inlineRuby:false});
   const record={provider:'utaten',lines:[{text:s.lrc,segments:core.segmentsFromDictionary(tokenizer,s.lrc,{inlineRuby:false})}]};
   const snapshot=JSON.stringify(record);
   const result=external.segmentsFor(s.yrc,external.prepare(record),'hiragana',null,{proofSegments:proof,reading:core.romajiToKana(s.roma)});
   assert(result,'Website mapping of annotated YRC: '+s.yrc);assert.equal(result.map(s=>s.text).join(''),s.yrc);
   assert.equal(result.filter(s=>!s.hidden).map(s=>s.text).join(''),s.visible||s.lrc);
   assert.equal(JSON.stringify(record),snapshot);
   for(const p of proof)if(p.rt)assert.equal(s.yrc.slice(p.at,p.at+p.text.length),p.text,'Context lookup preserves original UTF-16 offsets');
   assert.equal(core.romajiForLine(new Map([[core.lyricKey(s.lrc),s.roma]]),s.yrc,proof),s.roma);
  }
  for(const text of ['光（ああ）を抱く','君（きみと）歌う','宇宙（そら）を見る','歌（君の声と星(ほし)）']) {
   const result=core.segmentsFromDictionary(tokenizer,text);
   assert.equal(result.filter(s=>!s.hidden).map(s=>s.text).join(''),text==='歌（君の声と星(ほし)）'?'歌（君の声と星）':text,'Context tokenization must not erase normal or uncertain choruses');
  }
  // An unconfirmed chorus cannot become a key alias just because an LRC exists.
  const chorus='君（きみと）歌う',proof=core.segmentsFromDictionary(tokenizer,chorus,{inlineRuby:false});
  assert.equal(core.romajiForLine(new Map([['君歌う','ki mi u ta u']]),chorus,proof),null);
  for(const render of ['native','original','float','slide','slide-noruby']) {
   const karaoke=render==='float'||render.startsWith('slide');
   const initial=samples.map(s=>render==='native'?s.lrc:s.yrc);
   const wordHTML=t=>[...t.matchAll(/\S\s*|\s+/gu)].map(([c],i)=>`<div class="rnp-karaoke-word${/\s$/.test(c)?' end-with-space':''}" style="display:inline-block" data-time="${i*100}"><span>${c}</span>${render.startsWith('slide')?`<span class="rnp-karaoke-word-filler">${c}</span>`:''}</div>`).join('');
   const html=render==='native'?'<ul class="lyric">'+initial.map(t=>`<li class="line"><p>${t}</p><p class="translation">保留中文</p></li>`).join('')+'</ul>':
    '<div id="rnp-view"><div class="rnp-lyrics">'+initial.map(t=>`<div class="rnp-lyrics-line"><div class="rnp-lyrics-line-${karaoke?'karaoke':'original'}">${karaoke?wordHTML(t):t}</div><div class="rnp-lyrics-line-translated">保留中文</div></div>`).join('')+'</div></div>';
   const dom=new JSDOM('<body><div id="root">'+html+'</div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://music.163.com/'}),win=dom.window,handlers={};
   try {
    const timing=[...win.document.querySelectorAll('.rnp-karaoke-word')].map(n=>n.getAttribute('data-time'));
    win.TextEncoder=TextEncoder;
    const manifest=JSON.parse(fs.readFileSync(path.join(src,'manifest.json'),'utf8')),plus=manifest.slug.endsWith('-plus'),ns=plus?'JPFuriganaPlus':'JPFurigana';
    win.document.querySelector('#root').__reactContainer$test={memoizedProps:{store:{getState:()=>({playing:{resourceTrackId:'1'},setting:{showLyric:false}}),dispatch(){throw Error('No native action expected');},subscribe(){}}}};
    win.plugin={pluginPath:src,devMode:false,onLoad:f=>handlers.load=f,onConfig:f=>handlers.config=f};
    win.betterncm={app:{getBetterNCMVersion:async()=>'1.3.4'},ncm:{openUrl(){throw Error('No URL launch expected');}},fs:{exists:async()=>true}};
    win[plus?'kuromojiFuriganaPlus':'kuromoji']={builder:()=>({build:cb=>cb(null,tokenizer)})};
    win.fetch=async()=>({ok:true,json:async()=>({lrc:{lyric:samples.map((s,i)=>`[00:0${i+1}]${s.lrc}`).join('\n')},romalrc:{lyric:samples.map((s,i)=>`[00:0${i+1}]${s.roma}`).join('\n')}})});
    win.localStorage.setItem(manifest.slug+'.config',JSON.stringify({readingSource:'dict',desktopEnabled:false}));
    if(render.endsWith('noruby'))win.localStorage.setItem(manifest.slug+'.no-ruby','1');
    for(const {file} of manifest.injects.Main)if(!['kuromoji.js','desktop.js'].includes(file))win.eval(fs.readFileSync(path.join(src,file),'utf8'));
    await handlers.load();const api=win[ns];
    for(let i=0;i<100&&!api.state.tokenizer;i++)await sleep(30);
    for(const source of ['dict','romaji']) {
     api.set('readingSource',source);api.pass();await sleep(250);
     const lines=[...win.document.querySelectorAll(render==='native'?'li.line>p:first-child':'.rnp-lyrics-line-'+(karaoke?'karaoke':'original'))];
     for(let i=0;i<samples.length;i++) {
      const s=samples[i],line=lines[i];assert.equal(textOf(line),initial[i],render+' preserves original offsets');
      const expected=render==='native'||i===5?initial[i]:s.visible||s.lrc;
      // Dictionary-only mode cannot prove whether an identical kana is an echo.
      const visible=source==='dict'&&i===5?'空を見る':expected;
      assert.equal(textOf(line,true),visible,`${render}/${source}: inline annotations must not leak into the displayed lyric`);
      for(const [word,reading] of s.pairs)assert([...line.querySelectorAll('.fg-ruby')].some(n=>textOf(n)===word&&n.querySelector('.fg-rt').textContent===reading),`${render}/${source}: ${word} -> ${reading}`);
     }
     if(source==='romaji') {
      assert(api.state.srcRomaji>=samples.length-1,render+' maps annotated YRC back to the LRC romaji');
      assert([...lines[3].querySelectorAll('.fg-ruby')].some(n=>textOf(n)==='貴方'&&n.querySelector('.fg-rt').textContent==='きみ'),render+' uses the LRC reading instead of a dictionary fallback');
     }
     assert([...win.document.querySelectorAll('.translation,.rnp-lyrics-line-translated')].every(n=>n.textContent==='保留中文'));
     assert.deepEqual([...win.document.querySelectorAll('.rnp-karaoke-word')].map(n=>n.getAttribute('data-time')),timing,'Keep every karaoke timing host');
     for(const n of win.document.querySelectorAll('.fg-hide'))assert.equal(win.getComputedStyle(n).display,'none');
     for(const word of win.document.querySelectorAll('.rnp-karaoke-word')) {
      const host=word.querySelector('span:not(.rnp-karaoke-word-filler)'),twin=word.querySelector('.rnp-karaoke-word-filler');
      if(twin)assert.equal(textOf(host,true),textOf(twin,true),'The highlighted filler hides exactly the same annotations');
     }
    }
    api.disable();
    const lines=[...win.document.querySelectorAll(render==='native'?'li.line>p:first-child':'.rnp-lyrics-line-'+(karaoke?'karaoke':'original'))];
    lines.forEach((line,i)=>assert.equal(textOf(line),initial[i]));
    assert(!win.document.querySelector('.fg-hide,.fg-rt'));
   } finally {win.close();}
  }
  console.log('RNP parentheses passed: distinct LRC/YRC, actual dictionary, word stems and compounds, mixed chorus, echo, original/float/slide/no-ruby rendering, romaji lookup and disable restoration.');
 }catch(e){console.error(e);process.exitCode=1;}
});
