'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom'), core = require('../src/furigana.js');
const src = path.resolve(__dirname, '../src');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i=0;i<160;i++) { if(fn())return;await sleep(10); } throw Error('Language test timed out'); }
for (const lines of [[],['Stay with me tonight'],['我在等你'],['오늘도 함께'],['作詞: あおい','Arranged by ゆい','Stay with me'],['[ar:ゆい]','{"c":[{"tx":"あおい"}]}','Hello']]) assert.equal(core.hasJapaneseLyrics(lines),false);
for (const lines of [['Stay with me','空をみる'],['ｶﾀｶﾅ'],[{text:'あしたへ'}]] ) assert.equal(core.hasJapaneseLyrics(lines),true);

async function run(rnp) {
	const original='空をみる', dom=new JSDOM('<body><div id="root"></div><div class="rnp-settings-menu"><div class="rnp-settings-menu-tabs"><div data-tab="lyric">歌词</div></div><div class="rnp-settings-menu-inner"><div class="rnp-group" data-tab="lyric"></div></div></div></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://music.163.com/'});
	const win=dom.window, handlers={}, external=[], pending=new Map(), files=new Map();
	win.TextEncoder=TextEncoder;
	const root=win.document.getElementById('root');
	root.innerHTML=rnp?'<div id="rnp-view"><div class="rnp-lyrics"><div class="rnp-lyrics-line"><div class="rnp-lyrics-line-original">'+original+'</div><div class="rnp-lyrics-line-translated">あしたの空</div></div></div></div>':'<ul class="lyric"><li class="line"><p>'+original+'</p><p class="translation">あしたの空</p></li></ul>';
	let id='1', native={resourceTrackId:'1',lyricLines:[{time:0,lyric:'作詞: あおい'},{time:1,lyric:'Stay with me tonight'}],tlyricLines:[{time:1,lyric:original}]};
	const subscriptions=new Set(), store={getState:()=>({playing:{resourceTrackId:id,playId:id+'|play',playingState:2,curTrack:{id:Number(id),name:'星の手紙',artists:[{name:'あおい'}],language:'日语'}},setting:{showLyric:true},'async:lyric':native}),dispatch(){throw Error('Language detection must not change native settings');},subscribe(fn){subscriptions.add(fn);return()=>subscriptions.delete(fn);}};
	root.__reactContainer$test={memoizedProps:{store}};
	win.plugin={pluginPath:src,onLoad:fn=>handlers.load=fn,onConfig:fn=>handlers.config=fn};
	win.betterncm={app:{getBetterNCMVersion:async()=>'1.3.4'},ncm:{openUrl(){}},fs:{exists:async()=>true}};
	win.channel={call(){throw Error('Web furigana must not call desktop window APIs');}};
	Object.defineProperty(win,'webpackJsonp',{get(){throw Error('Web furigana must not inspect the native bridge');}});
	win.kuromoji={builder:()=>({build:callback=>callback(null,{tokenize:text=>[...text].map(surface_form=>({surface_form,reading:surface_form==='空'?'ソラ':surface_form,word_type:'KNOWN'}))})})};
	win.fetch=async url=>{
		assert(url.includes('/api/song/lyric'), 'Reuse the official lyric request instead of adding a per-song wiki request');
		const trackId=new URL(url).searchParams.get('id');
		return new Promise((resolve,reject)=>pending.set(trackId,{resolve:json=>resolve({ok:true,json:async()=>json}),reject}));
	};
	for(const name of ['furigana.js','external-core.js','user-edits.js','external.js','editor.js','source-dialog.js','rnp-settings.js'])win.eval(fs.readFileSync(path.join(src,name),'utf8'));
	const record={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/pinned/',title:'星の手紙',artists:['あおい'],lines:[{text:original,segments:[{text:'空',rt:'そら'},{text:'をみる'}]}],manualSource:{provider:'utaten',url:'https://utaten.com/lyric/pinned/'}};
	const cachePath='C:/Test/lyrics/jp-furigana/1.json', originalCache=JSON.stringify(record);files.set(cachePath,originalCache);
	win.FuriganaExternal.browserTransport=()=>({dataRoot:async()=>'C:/Test',parse:html=>new win.DOMParser().parseFromString(html,'text/html'),fs:{mkdir:async()=>true,exists:async p=>files.has(p),readFileText:async p=>files.get(p),writeFileText:async(p,v)=>{files.set(p,v);return true;}},request:async url=>{
		external.push(url);return url.includes('/search')?'<table><tr><td class="searchResult__title"><a href="/lyric/test/">星の手紙</a></td><td class="searchResult__artist"><p><a>あおい</a></p></td></tr></table>':'<h2 class="newLyricTitle__main">星の手紙</h2><h3><a href="/artist/1/">あおい</a></h3><div class="lyricBody"><div class="hiragana"><span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>をみる</div></div>';
	}});

	win.localStorage.setItem('jp-furigana.config',JSON.stringify({readingSource:'external',externalProvider:'utaten',externalAutoRetry:'off',skipCredits:false}));
	win.eval(fs.readFileSync(path.join(src,'main.js'),'utf8'));
	const notify=()=>{for(const fn of [...subscriptions])fn();win.JPFurigana.pass();};
	const lrc=lines=>({lrc:{lyric:lines.map((t,i)=>'[00:'+String(i).padStart(2,'0')+']'+t).join('\n')}});
	try {
		await handlers.load();await until(()=>pending.has('1'));pending.get('1').resolve(lrc(['作詞: あおい','Stay with me tonight']));
		await until(()=>win.JPFurigana.languageStatus().eligible===false&&win.JPFurigana.state.apiStatus!=='加载中');
		await sleep(40);assert.equal(external.length,0);assert(!win.document.querySelector('.fg-rt'));
		assert(win.JPFurigana.readings(original).every(s=>!s.rt));
		const panel=handlers.config();win.document.body.append(panel);
		assert.match(panel.querySelector('.fg-external-status').textContent,/未发现日语/);
		for(const action of ['externalRetry','externalAssign','editMode']){const button=panel.querySelector('[data-a="'+action+'"]');assert(button.disabled);button.click();}
		await until(()=>win.document.querySelector('[data-status]'));
		for(const action of ['retry','assign','edit'])assert(win.document.querySelector('[data-action="'+action+'"]').disabled);
		assert.equal(files.get(cachePath),originalCache,'A foreign track does not fetch or rewrite even an existing manually selected cache');
		// Current DOM is Japanese, but the new song and original-lyric request must still be verified.
		id='2';notify();await until(()=>pending.has('2'));await sleep(30);assert.equal(external.length,0);assert.equal(win.JPFurigana.languageStatus().eligible,null);
		native={resourceTrackId:'2',lyricLines:[{time:0,lyric:'Stay with me'}]};notify();assert.equal(external.length,0);
		pending.get('2').resolve(lrc(['Stay with me',original]));await until(()=>external.length===2&&win.JPFurigana.languageStatus().eligible===true);
		assert.equal(win.JPFurigana.languageStatus().eligible,true,'A mixed-language song remains eligible even when its first verse is English');
		native={resourceTrackId:'2',lyricLines:[{time:1,lyric:original}]};
		const count=external.length;id='3';notify();await until(()=>pending.has('3'));
		pending.get('3').resolve(lrc(['Stay with me']));await until(()=>win.JPFurigana.languageStatus().eligible===false);await sleep(30);
		assert.equal(external.length,count,'Neither stale DOM nor previous-song native lyrics authorize another search');assert(!files.has('C:/Test/lyrics/jp-furigana/3.json'));

		id='4';notify();await until(()=>pending.has('4'));pending.get('4').reject(Error('Original lyric unavailable'));
		await until(()=>win.JPFurigana.state.apiStatus.startsWith('失败'));
		assert.equal(win.JPFurigana.languageStatus().eligible,null);assert.equal(external.length,count);assert.match(panel.querySelector('.fg-external-status').textContent,/无法确认歌词语种/);
		const failedRequest=pending.get('4');panel.querySelector('[data-a="externalRetry"]').click();await until(()=>pending.get('4')!==failedRequest);
		assert.equal(external.length,count,'Retrying an unknown language only refetches official originals');pending.get('4').resolve(lrc(['Stay with me']));await until(()=>win.JPFurigana.languageStatus().eligible===false);assert.equal(external.length,count);
		id='5';notify();await until(()=>pending.has('5'));pending.get('5').resolve({yrc:{lyric:'[1000,1200](1000,600,0)空(1600,600,0)をみる'}});
		await until(()=>win.JPFurigana.languageStatus().eligible===true&&external.length===count+2);
		assert.equal(win.JPFurigana.state.evidence.lines[0],original,'YRC-only Japanese lyrics also qualify');
	} finally { win.dispatchEvent(new win.Event('beforeunload'));win.close(); }
}
(async()=>{await run(false);await run(true);console.log('Language gating passed: originals only, credit/translation/title isolation, mixed language, pending/error states, stale DOM/native lyrics, pinned-cache isolation, both menus and YRC-only originals.');})().catch(error=>{console.error(error);process.exitCode=1;});
