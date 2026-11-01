'use strict';
// The external-site notice gates every way into readingSource = 'external'.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const src = path.resolve(__dirname, '../src'), manifest = require('../src/manifest.json');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const lyric = '空をみる';
async function fixture(saved) {
	const dom = new JSDOM('<body><div id="root"><ul class="lyric"><li class="line"><p>' + lyric + '</p></li></ul></div></body>', { url: 'https://music.163.com/', runScripts: 'outside-only', pretendToBeVisual: true });
	const win = dom.window, handlers = {}, opened = [], requests = [];
	win.document.getElementById('root').__reactContainer$test = { memoizedProps: { store: { getState: () => ({ playing: { resourceTrackId: '1', curTrack: { id: 1, name: '試験曲', artists: [{ name: '試験歌手' }] } }, setting: {} }), dispatch() {}, subscribe() {} } } };
	win.loadedPlugins = { 'jp-furigana': { manifest } };
	win.plugin = { pluginPath: src, devMode: false, onLoad: f => handlers.load = f, onAllPluginsLoaded: f => handlers.all = f, onConfig: f => handlers.config = f };
	win.betterncm = { app: { getBetterNCMVersion: async () => '1.3.4' }, ncm: { openUrl: url => opened.push(url) }, fs: { exists: async () => true } };
	win.kuromoji = { builder: () => ({ build: cb => cb(null, { tokenize: text => [...text].map(c => ({ surface_form: c, reading: c === '空' ? 'ソラ' : c, word_type: 'KNOWN' })) }) }) };
	win.fetch = async () => ({ ok: true, json: async () => ({ lrc: { lyric: '[00:01]' + lyric } }) });
	if (saved) win.localStorage.setItem('jp-furigana.config', JSON.stringify(saved));
	for (const { file } of manifest.injects.Main) if (file !== 'kuromoji.js' && file !== 'main.js') win.eval(fs.readFileSync(path.join(src, file), 'utf8'));
	win.FuriganaExternal.browserTransport = () => ({ dataRoot: async () => 'C:/Test', parse: html => new win.DOMParser().parseFromString(html, 'text/html'),
		fs: { mkdir: async () => true, exists: async () => false, readFileText: async () => '', writeFileText: async () => true },
		request: async url => { requests.push(url); return ''; } });
	win.eval(fs.readFileSync(path.join(src, 'main.js'), 'utf8'));
	await handlers.all(win.loadedPlugins);
	const notice = () => win.document.querySelector('[role=alertdialog]');
	const stored = () => JSON.parse(win.localStorage.getItem('jp-furigana.config') || '{}');
	return { win, handlers, opened, requests, notice, stored };
}
async function until(fn) { for (let n = 0; n < 200; n++) { if (fn()) return; await tick(); } throw new Error('Timed out'); }
(async () => {
	// Choosing 外部网站 asks first; cancelling keeps the previous source.
	let f = await fixture();
	assert.equal(f.win.JPFurigana.config.externalConsent, false);
	assert.equal(f.win.JPFurigana.set('readingSource', 'external'), 'romaji', 'Nothing changes until the user confirms');
	assert(f.notice(), 'The notice is shown');
	f.notice().querySelector('[data-cancel]').click(); await tick();
	assert.equal(f.win.JPFurigana.config.readingSource, 'romaji'); assert.equal(f.win.JPFurigana.config.externalConsent, false);
	// The settings page select returns to the saved source after cancelling.
	const panel = f.handlers.config(), select = panel.querySelector('[data-k="readingSource"]');
	f.win.document.body.append(panel);
	select.value = 'external'; select.dispatchEvent(new f.win.Event('change')); assert(f.notice());
	f.notice().querySelector('[data-open="https://www.uta-net.com/info/kiyaku.html"]').click();
	assert.deepEqual(f.opened, ['https://www.uta-net.com/info/kiyaku.html']);
	f.notice().querySelector('[data-cancel]').click(); await tick();
	assert.equal(select.value, 'romaji'); assert(panel.querySelector('.fg-external-settings').hidden);
	// Confirming switches the source and is remembered, so later switches do not ask again.
	select.value = 'external'; select.dispatchEvent(new f.win.Event('change'));
	f.notice().querySelector('[data-accept]').click(); await tick();
	assert.equal(f.win.JPFurigana.config.readingSource, 'external'); assert.equal(select.value, 'external');
	assert.equal(f.stored().externalConsent, true); assert.equal(f.stored().readingSource, 'external');
	f.win.JPFurigana.set('readingSource', 'dict'); assert.equal(f.win.JPFurigana.set('readingSource', 'external'), 'external'); assert(!f.notice());
	// 撤销同意：切回网易云音译并清掉确认，下次开启外部网站会重新提示。
	const revoke = panel.querySelector('[data-a="revokeConsent"]');
	assert(panel.querySelector('.fg-consent-row').hidden === false, 'The revoke button is shown after consenting');
	revoke.click(); await tick();
	assert.equal(f.win.JPFurigana.config.readingSource, 'romaji'); assert.equal(f.win.JPFurigana.config.externalConsent, false);
	assert.equal(f.stored().externalConsent, false); assert.equal(select.value, 'romaji');
	assert(panel.querySelector('.fg-consent-row').hidden, 'The revoke button hides once consent is withdrawn');
	f.win.JPFurigana.set('readingSource', 'external'); assert(f.notice(), 'Revoking makes the notice appear again');
	f.notice().querySelector('[data-cancel]').click(); await tick(); assert.equal(f.win.JPFurigana.config.readingSource, 'romaji');
	f.win.close();

	// Settings saved before the notice existed: ask before the first request, fall back on cancel.
	f = await fixture({ readingSource: 'external', configVersion: 4 });
	await until(() => f.notice());
	assert.equal(f.requests.length, 0, 'Existing external users see the notice before any website request');
	f.notice().querySelector('[data-cancel]').click(); await tick();
	assert.equal(f.win.JPFurigana.config.readingSource, 'romaji'); assert.equal(f.stored().readingSource, 'romaji');
	f.win.JPFurigana.pass(); await tick(); await tick(); assert.equal(f.requests.length, 0); assert(!f.notice());
	f.win.close();

	// Users who already confirmed are not asked again.
	f = await fixture({ readingSource: 'external', externalConsent: true, configVersion: 4 });
	await until(() => f.requests.length);
	assert(!f.notice()); assert.equal(f.win.JPFurigana.config.readingSource, 'external');
	f.win.close();
	console.log('External consent passed: notice before switching, cancel keeps source, settings select revert, remembered confirmation, revoking, legacy external settings and terms links.');
})().catch(e => { console.error(e); process.exitCode = 1; });
