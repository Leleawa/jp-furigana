'use strict';
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const src = path.resolve(__dirname, '../src');
const screenshot = require('./fixtures/utaten-confusions.cjs');
const weekend = require('./fixtures/utaten-weekend.cjs');
const alternates = require('./fixtures/utaten-alternates.cjs');
const rnp = process.argv.includes('rnp');
const original = '恋人と空をみる';
const texts = [original, screenshot.target, '空をみる日', weekend.target, alternates.target,...alternates.context.map(l=>l.target||l.text)];
const native = '<ul class="lyric">' + texts.map(text => '<li class="line"><p>' + text + '</p><p class="translation">保留原来的中文翻译</p></li>').join('') + '</ul>';
const karaoke = '<div id="rnp-view"><div class="rnp-lyrics">' + texts.map(text => '<div class="rnp-lyrics-line"><div class="rnp-lyrics-line-karaoke">' +
	[...text].map(c => '<div class="rnp-karaoke-word" style="display:inline-block"><span>' + c + '</span><span class="rnp-karaoke-word-filler">' + c + '</span></div>').join('') +
	'</div><div class="translation rnp-lyrics-line-translated">保留原来的中文翻译</div></div>').join('') + '</div></div>';
const dom = new JSDOM('<body><div id="root">' + (rnp ? '<div class="g-single" style="visibility:hidden">' + native + '</div>' : native) + '</div>' + (rnp ? karaoke : '') + '</body>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://music.163.com/' });
const win = dom.window, handlers = {}, disk = new Map();
win.TextEncoder = TextEncoder;
let songId = '1', pending, requests = 0, failure = '';
const settingActions = [];
const metadata = { id: 1, name: '星の手紙', artists: [{ name: '試験歌手' }] };
win.document.getElementById('root').__reactContainer$test = { memoizedProps: { store: { getState: () => ({ playing: { resourceTrackId: songId, curTrack: { ...metadata, id: Number(songId) } }, setting: { showLyric: false } }), dispatch(action) { settingActions.push(action); }, subscribe() {} } } };
win.plugin = { pluginPath: src, devMode: false, onLoad: f => handlers.load = f, onConfig: f => handlers.config = f };
win.betterncm = { app: { getBetterNCMVersion: async () => '1.3.4' }, ncm: { openUrl(url) { const target=/^orpheus:\/\/song\/(\d+)/.exec(url);if(target)songId=target[1]; } }, fs: { exists: async () => true } };
win.kuromoji = { builder: () => ({ build: cb => cb(null, { tokenize: text => {
	const words = [['恋人', 'コイビト'], ['空', 'ソラ'], ['日', 'ヒ'], ['抗', 'アラガ'], ['沖動', 'オキドウ'], ['暗', 'アン'], ['彼', 'カレ'], ['包', 'ツツ'], ['終末','シュウマツ'], ['旗','キ'], ['送','ク']];
	const tokens = [];
	for (let at = 0; at < text.length;) {
		const [surface_form, reading] = words.find(([word]) => text.startsWith(word, at)) || [text[at], text[at]];
		tokens.push({ surface_form, reading, word_type: 'KNOWN' }); at += surface_form.length;
	}
	return tokens;
} }) }) };
win.fetch = async () => ({ ok: true, json: async () => ({
	lrc: { lyric: texts.map((text, i) => '[00:0' + (i + 1) + ']' + text).join('\n') },
	romalrc: { lyric: '[00:01]ko i bi to to so ra wo mi ru\n[00:02]a ra ga e nu o ki do u no a n ga ka re wo tsu tsu n da\n[00:03]so ra wo mi ru hi\n[00:04]shu u ma tsu ki wo ku tte ya ru ka ra' }
}) });
for (const file of ['furigana.js', 'external-core.js', 'user-edits.js', 'external.js', 'editor.js', 'source-dialog.js', 'rnp-settings.js']) win.eval(fs.readFileSync(path.join(src, file), 'utf8'));
win.FuriganaExternal.browserTransport = () => ({
	dataRoot: async () => 'C:/BetterNCM',
	fs: { mkdir: async () => true, exists: async p => disk.has(p), readFileText: async p => disk.get(p), readDir:async()=>[...disk.keys()],remove:async p=>disk.delete(p),writeFileText: async (p, value) => { disk.set(p, value); return true; } },
	parse: html => new win.DOMParser().parseFromString(html, 'text/html'),
	request: async url => {
		requests++;
		if (failure === 'timeout') throw win.FuriganaExternal.requestError({ timeout: true });
		if (failure === 'empty') return '';
		assert.equal(new URL(url).hostname, 'utaten.com', 'UtaTen-only must never request Uta-Net');
		if (url.includes('/search')) return '<table><tr><td class="searchResult__title"><a href="/lyric/test001/">星の手紙</a></td><td class="searchResult__artist"><p><a>試験歌手</a></p></td></tr></table>';
		await new Promise(resolve => { pending = resolve; });
		return '<h2 class="newLyricTitle__main">星の手紙<span>歌詞</span></h2><h3><a href="/artist/1">試験歌手</a></h3><div class="lyricBody"><div class="hiragana"><span class="ruby"><span class="rb">恋人</span><span class="rt">あなた</span></span>と<span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>をみる<br>' + [screenshot.html,weekend.html,alternates.html,...alternates.context.map(l=>l.html)].join('<br>') + '</div></div>';
	}
});
win.localStorage.setItem('jp-furigana.config', JSON.stringify({ readingSource: 'external', externalProvider: 'utaten' }));
win.eval(fs.readFileSync(path.join(src, 'main.js'), 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let n = 0; n < 100; n++) { if (fn()) return; await sleep(30); } throw new Error('Timed out waiting for plugin'); }
const lyricLines = () => [...win.document.querySelectorAll(rnp ? '.rnp-lyrics-line-karaoke' : 'li.line > p:first-child')];
const readings = (i = 0) => [...lyricLines()[i].querySelectorAll('.fg-rt')].map(n => n.textContent);
const baseText = element => { const copy = element.cloneNode(true); for (const n of copy.querySelectorAll('.fg-rt,rt,.rnp-karaoke-word-filler')) n.remove(); return copy.textContent; };
const assertScreenshot = (mode = 'hiragana') => {
	assert.equal(baseText(lyricLines()[1]), screenshot.target);
	const pairs = [...lyricLines()[1].querySelectorAll('.fg-ruby')].map(n => [baseText(n), n.querySelector('.fg-rt').textContent]);
	for (const [text, rt] of [['沖動', mode === 'hiragana' ? 'しょうどう' : 'ショウドウ'], ['暗', mode === 'hiragana' ? 'やみ' : 'ヤミ']]) {
		assert(pairs.some(p => p[0] === text && p[1] === rt), text + ' must use the website reading at its original position');
	}
	assert.equal(baseText(lyricLines()[3]),weekend.target);
	const wordPairs=[...lyricLines()[3].querySelectorAll('.fg-ruby')].map(n=>[baseText(n),n.querySelector('.fg-rt').textContent]);
	for(const [text,rt] of [['終末','しゅうまつ'],['旗','はた'],['送','おく']])assert(wordPairs.some(p=>p[0]===text&&p[1]===win.FuriganaExternalCore.kana(rt,mode)),text+' must use UtaTen despite the contextual spelling difference');
	assert.equal(baseText(lyricLines()[4]),alternates.target);
	assert([...lyricLines()[4].querySelectorAll('.fg-ruby')].some(n=>baseText(n).includes('灯り')&&n.querySelector('.fg-rt').textContent.includes(win.FuriganaExternalCore.kana('ひかり',mode))),'Unequal-length words use website speech');
	assert.equal(baseText(lyricLines()[6]),'かんじ');assert(readings(6).includes(win.FuriganaExternalCore.kana('かんじ',mode)),'Surrounding originals establish a short kana-only line');
};
(async () => {
	await handlers.load();
	await until(() => pending && readings().includes('こいびと'));
	const panel = handlers.config(); win.document.body.append(panel);
	panel.querySelector('[data-a="editMode"]').click();
	await until(() => panel.querySelector('[data-a="editMode"]').classList.contains('fg-edit-interrupt'));
	assert.equal(panel.querySelector('[data-a="editMode"]').textContent,'将中断网站注音获取，再次点击进入编辑模式');
	assert(win.JPFurigana.externalStatus().loading,'First edit click must not cancel an in-flight request');
	assert.equal(win.JPFurigana.state.srcExternal, 0, 'Official/local fallback visible while website is pending');
	assert(readings(1).includes('あん'), 'Reproduce the old fallback reading before the website is ready');
	assert(readings(3).includes('き'),'Reproduce the incorrect local reading of 旗 while the website is pending');
	pending();
	await until(() => readings().includes('あなた'));
	assert(win.JPFurigana.readings(original).some(s => s.text === '恋人' && s.rt === 'あなた'), 'Public resolver must use the same website readings as the playing page');
	assert(win.JPFurigana.readings(weekend.target).some(s=>s.text==='旗'&&s.rt==='はた'),'The public resolver must share the contextual website fix');
	assert(win.JPFurigana.readings('かんじ').some(s=>s.rt==='かんじ'),'Public resolver and lyric page share original-line context even for kana-only variants');
	assert(!win.JPFurigana.readings('作詞: 空ゆい子').some(s=>s.rt),'Public resolver inherits credit skipping even when the artist has kana');
	assert.equal(win.JPFurigana.state.srcExternal, 7);
	assert.equal(win.JPFurigana.state.srcRomaji, 1, 'An actually unmatched line still falls back');
	assertScreenshot();
	assert([...win.document.querySelectorAll('.translation')].every(n => n.textContent === '保留原来的中文翻译'));
	assert(!panel.querySelector('[data-a="editMode"]').classList.contains('fg-edit-interrupt'),'A completed request clears interruption confirmation');
	assert(!win.document.body.classList.contains('fg-edit-mode'));
	assert(panel.querySelector('option[value="external"]'));
	assert.equal(panel.querySelector('.fg-external-settings').hidden, false);
	assert(panel.querySelector('.fg-external-status').textContent.includes('UtaTen'));
	assert(panel.querySelector('.fg-external-status').textContent.includes('网站命中 7 行；网易云音译回退 1 行'));
	// Exercise the real settings -> dialog -> per-song persistence path.
	const beforeManual = requests;
	panel.querySelector('[data-a="externalAssign"]').click();
	await until(() => win.document.querySelector('.fg-source-dialog'));
	let sourceDialog = win.document.querySelector('.fg-source-dialog'); assert(sourceDialog);
	sourceDialog.querySelector('[data-url]').value = 'https://utaten.com/search';
	sourceDialog.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
	assert(sourceDialog.isConnected); assert.equal(requests, beforeManual);
	sourceDialog.querySelector('[data-url]').value = 'https://www.utaten.com/lyric/test001/?from=test';
	pending = null;
	sourceDialog.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
	await until(() => pending); pending();
	await until(() => !win.JPFurigana.externalStatus().loading && win.JPFurigana.externalStatus().manualUrl);
	assert.equal(JSON.parse(disk.get('C:/BetterNCM/lyrics/jp-furigana/1.json')).manualSource.url, 'https://utaten.com/lyric/test001/');
	assert.equal(requests, beforeManual + 1, 'Manual selection requests the detail page directly');
	assert(readings().includes('あなた'));
	assert(!panel.querySelector('[data-k="externalProxy"]'));
	assert(!panel.querySelector('[data-k="externalProxyEnabled"]'));
	assert.throws(()=>win.JPFurigana.set('externalProxy','http://127.0.0.1:9'),/未知设置项/);
	// The RNP menu is mounted later than plugin initialization, as in the real client.
	const rnpMenu = win.document.createElement('div'); rnpMenu.className = 'rnp-settings-menu';
	rnpMenu.innerHTML = '<div class="rnp-settings-menu-tabs"><div class="rnp-settings-menu-tab" data-tab="lyric">歌词</div><div class="rnp-settings-menu-tab" data-tab="font">字体</div></div><div class="rnp-settings-menu-inner"><div class="rnp-group" data-tab="lyric"></div><div class="rnp-group" data-tab="font"></div></div>';
	win.document.body.append(rnpMenu);
	await until(() => rnpMenu.querySelector('[data-key="enabled"]'));
	assert(!panel.querySelector('[data-k^="desktop"]')&&!rnpMenu.querySelector('[data-key^="desktop"]'),'Web build exposes no desktop controls');
	assert.equal(settingActions.length,0,'Web settings never dispatch native playback/settings actions');
	const beforeStyleChange = requests;
	const size = rnpMenu.querySelector('[data-key="rtSize"]'); size.value = '70'; size.dispatchEvent(new win.Event('input'));
	assert.equal(win.JPFurigana.config.rtSize,60,'Range input must not persist or remeasure annotations');
	size.dispatchEvent(new win.Event('change'));
	assert.equal(win.JPFurigana.config.rtSize, 70); assert.equal(panel.querySelector('[data-k="rtSize"]').value, '70');
	assert.equal(requests, beforeStyleChange, 'Appearance changes must not reload external lyrics');
	const normalSize = panel.querySelector('[data-k="rtSize"]'); normalSize.value = '60'; normalSize.dispatchEvent(new win.Event('input'));
	assert.equal(win.JPFurigana.config.rtSize,70);normalSize.dispatchEvent(new win.Event('change'));
	assert.equal(size.value, '60', 'Normal settings synchronize back to the RNP menu');
	rnpMenu.querySelector('[data-choice="externalAutoRetry"] [data-value="off"]').click();
	assert.equal(panel.querySelector('[data-k="externalAutoRetry"]').value, 'off');
	assert.equal(requests, beforeStyleChange, 'Disabling auto retry does not trigger a new request');
	const rnpEnabled = rnpMenu.querySelector('[data-key="enabled"]'); rnpEnabled.checked = false; rnpEnabled.dispatchEvent(new win.Event('change'));
	assert.equal(win.JPFurigana.config.enabled, false); assert(!panel.querySelector('[data-k="enabled"]').checked);
	assert(lyricLines().every(n => !n.querySelector('.fg-rt')));
	rnpEnabled.checked = true; rnpEnabled.dispatchEvent(new win.Event('change'));
	await until(() => readings().includes('あなた')); assert.equal(requests, beforeStyleChange);
	// RNP uses the same two-step confirmation, and cancelling a refresh retains its cache.
	pending=null;panel.querySelector('[data-a="externalRetry"]').click();await until(()=>pending);
	const retainedCache=disk.get('C:/BetterNCM/lyrics/jp-furigana/1.json');
	rnpMenu.querySelector('[data-action="edit"]').click();await until(()=>rnpMenu.querySelector('[data-action="edit"]').classList.contains('fg-edit-interrupt'));
	assert(win.JPFurigana.externalStatus().loading);
	rnpMenu.querySelector('[data-action="edit"]').click();await until(()=>win.document.body.classList.contains('fg-edit-mode')&&!win.JPFurigana.externalStatus().loading);
	assert.equal(disk.get('C:/BetterNCM/lyrics/jp-furigana/1.json'),retainedCache);
	pending();await sleep(50);assert.equal(disk.get('C:/BetterNCM/lyrics/jp-furigana/1.json'),retainedCache,'Late cancelled response cannot overwrite the cache');
	panel.querySelector('[data-a="editMode"]').click();await until(()=>!win.document.body.classList.contains('fg-edit-mode'));
	const count = requests;
	// Edit the actual rendered annotation; the RNP filler must mirror the change.
	panel.querySelector('[data-a="editMode"]').click();
	await until(() => win.document.body.classList.contains('fg-edit-mode'));
	let word = lyricLines()[0].querySelector('.fg-ruby[data-fg-editable]');
	word.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
	let input = win.document.querySelector('.fg-editor-pop [data-reading]');
	assert(input); input.value = 'きみ'; input.dispatchEvent(new win.Event('input'));
	input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
	await until(() => lyricLines()[0].querySelector('.fg-edit-custom')?.textContent === 'きみ');
	assert.equal(lyricLines()[0].querySelector('.fg-edit-original').textContent, 'あなた');
	assert(win.JPFurigana.readings(original).some(s => s.text === '恋人' && s.rt === 'きみ'), 'Public resolver shares saved user corrections');
	assert.equal(baseText(lyricLines()[0]), original);
	if (rnp) assert(lyricLines()[0].querySelector('.rnp-karaoke-word-filler .fg-edit-custom'));
	assert.equal(JSON.parse(disk.get('C:/BetterNCM/lyrics/jp-furigana/1.json')).userEdits[0].reading, 'きみ');
	word = lyricLines()[0].querySelector('.fg-ruby[data-fg-editable]'); word.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
	win.document.querySelector('[data-restore]').click(); await until(() => readings().includes('あなた') && !lyricLines()[0].querySelector('.fg-edit-custom'));
	panel.querySelector('[data-a="editMode"]').click(); await until(() => !win.document.body.classList.contains('fg-edit-mode'));
	assert.equal(requests, count, 'Edit/save/restore must not fetch lyrics');
	win.JPFurigana.set('kana', 'katakana');
	await until(() => readings().includes('アナタ'));
	assertScreenshot('katakana');
	assert.equal(requests, count, 'Kana style change reuses disk cache');
	win.JPFurigana.disable();
	assert.equal(baseText(lyricLines()[0]), original);
	assert.equal(baseText(lyricLines()[1]), screenshot.target);
	assert(lyricLines().every(n => !n.querySelector('.fg-rt')));
	pending = null; songId = '2'; win.JPFurigana.enable();
	await until(() => pending && win.JPFurigana.state.externalTrackId === '2' && readings().includes('コイビト'));
	assert(!readings().includes('アナタ'), 'Previous song must not leak into the next song');
	assert(!readings(1).includes('ヤミ'), 'Corrected external reading must not leak into a new song');
	win.JPFurigana.set('readingSource', 'dict'); pending();
	await sleep(150); win.JPFurigana.pass(); await sleep(150);
	assert(!readings().includes('アナタ'), 'Disabled external source must ignore late completion');
	assert(!disk.has('C:/BetterNCM/lyrics/jp-furigana/2.json'));
	// A song without any website record can still enter editing and persist only corrections.
	failure = 'timeout';
	panel.querySelector('[data-a="editMode"]').click();
	await until(() => win.document.body.classList.contains('fg-edit-mode') && lyricLines()[0].querySelector('[data-fg-editable]'));
	word = lyricLines()[0].querySelector('[data-fg-editable]'); word.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
	input = win.document.querySelector('[data-reading]'); assert(input); input.value = 'きみ'; input.dispatchEvent(new win.Event('input'));
	input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
	await until(() => JSON.parse(disk.get('C:/BetterNCM/lyrics/jp-furigana/2.json') || '{}').userEdits?.length === 1);
	const local = JSON.parse(disk.get('C:/BetterNCM/lyrics/jp-furigana/2.json'));
	assert.equal(local.provider, 'local'); assert.deepEqual(local.lines, []);
	assert.equal(local.userEdits[0].reading, 'きみ'); assert.equal(baseText(lyricLines()[0]), original);
	// Both settings surfaces must expose the actual failure, even with local edits ready.
	panel.querySelector('[data-a="editMode"]').click();
	failure = 'timeout'; panel.querySelector('[data-a="externalRetry"]').click();
	await until(() => !win.JPFurigana.externalStatus().loading && win.JPFurigana.externalStatus().error.includes('网络请求超时'));
	for (const message of [panel.querySelector('.fg-external-status'), rnpMenu.querySelector('[data-status]')]) {
		assert.match(message.textContent, /UtaTen：搜索页面：网络请求超时/);
		assert(!message.textContent.includes('暂未获取'));
	}
	assert.equal(win.JPFurigana.externalStatus().source, 'local');
	failure = 'empty'; panel.querySelector('[data-a="externalRetry"]').click();
	await until(() => !win.JPFurigana.externalStatus().loading && win.JPFurigana.externalStatus().error.includes('空页面'));
	assert.match(rnpMenu.querySelector('[data-status]').textContent, /空页面（HTTP 200）/);
	assert(!rnpMenu.querySelector('[data-status]').textContent.includes('未找到同名歌曲'));
	// Retry countdown and the previous failure stay visible in the compact menu too.
	win.JPFurigana.set('externalAutoRetry', 'failed');
	await until(() => win.JPFurigana.externalStatus().waitingRetry);
	assert.match(rnpMenu.querySelector('[data-status]').textContent, /空页面.*\n?.*自动重试（1\/3）/);
	win.JPFurigana.set('externalAutoRetry', 'off');
	await until(() => !win.JPFurigana.externalStatus().loading);
	failure = ''; pending = null; panel.querySelector('[data-a="externalRetry"]').click();
	await until(() => pending); pending();
	await until(() => !win.JPFurigana.externalStatus().loading && win.JPFurigana.externalStatus().source === 'utaten');
	assert.equal(win.JPFurigana.externalStatus().error, '');
	assert(!rnpMenu.querySelector('[data-status]').textContent.includes('获取失败'));
	// A cached source is used only for this load, without changing the user's global scope.
	win.JPFurigana.set('externalProvider','auto');await until(()=>!win.JPFurigana.externalStatus().loading);
	disk.set('C:/BetterNCM/lyrics/jp-furigana/1.json',JSON.stringify({schema:1,songId:'1',provider:'utanet',url:'https://www.uta-net.com/global/en/lyric/12/',title:'星の手紙',artists:['試験歌手'],lines:[{text:original,romaji:'ko i bi to to so ra wo mi ru'}]}));
	const beforeCachedPlay=requests;panel.querySelector('[data-a="cacheManager"]').click();
	await until(()=>win.document.querySelectorAll('.fg-cache-row').length===2);
	const cachedRow=[...win.document.querySelectorAll('.fg-cache-row')].find(row=>row.querySelector('small').textContent.includes(' · 1 · '));
	[...cachedRow.querySelectorAll('button')].find(button=>button.textContent==='播放并编辑').click();
	await until(()=>songId==='1'&&win.document.body.classList.contains('fg-edit-mode')&&win.JPFurigana.externalStatus().source==='utanet');
	assert.equal(requests,beforeCachedPlay);assert.equal(win.JPFurigana.config.externalProvider,'auto');assert.equal(JSON.parse(win.localStorage.getItem('jp-furigana.config')).externalProvider,'auto');
	assert.equal(win.JPFurigana.externalStatus().settings.externalProvider,'utanet');
	panel.querySelector('[data-a="editMode"]').click();await until(()=>!win.document.body.classList.contains('fg-edit-mode'));
	// Deleting the current cache invalidates the playback marker and performs a fresh lookup.
	win.confirm=()=>true;pending=null;panel.querySelector('[data-a="cacheManager"]').click();await until(()=>win.document.querySelectorAll('.fg-cache-row').length===2);
	const deleteRow=[...win.document.querySelectorAll('.fg-cache-row')].find(row=>row.querySelector('small').textContent.includes(' · 1 · '));
	[...deleteRow.querySelectorAll('button')].find(button=>button.textContent==='删除').click();
	await until(()=>pending&&requests>beforeCachedPlay);assert(win.JPFurigana.externalStatus().loading);assert(!panel.querySelector('.fg-external-status').textContent.includes('未启用外部网站'));
	pending();await until(()=>disk.has('C:/BetterNCM/lyrics/jp-furigana/1.json')&&!win.JPFurigana.externalStatus().loading);
	console.log('Integration tests passed (' + (rnp ? 'RNP split karaoke and filler' : 'native DOM') + '): screenshot correction, immediate fallback, async replacement, translations, settings, cached kana toggle, disable restore, track isolation and late-result cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => win.close());
