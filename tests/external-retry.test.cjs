'use strict';
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { create, requestError } = require('../src/external.js');
const search = '<table><tr><td class="searchResult__title"><a href="/lyric/test/">試験曲</a></td><td class="searchResult__artist"><p><a>試験歌手</a></p></td></tr></table>';
const song = '<h2 class="newLyricTitle__main">試験曲</h2><h3><a href="/artist/1">試験歌手</a></h3><div class="lyricBody"><div class="hiragana"><span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>を見る</div></div>';
const metadata = async () => ({ title: '試験曲', artists: ['試験歌手'] });
const off = { externalProvider: 'utaten', externalAutoRetry: 'off' }, on = { ...off, externalAutoRetry: 'failed' };
const timeout = () => requestError({ timeout: true });
function fixture(request, retryDelays = [0, 0, 0]) {
	const files = new Map(), states = [];
	const client = create({ request, retryDelays, dataRoot: async () => 'C:/Test', parse: html => new JSDOM(html).window.document,
		fs: { mkdir: async () => true, exists: async p => files.has(p), readFileText: async p => files.get(p), writeFileText: async (p, v) => { files.set(p, v); return true; } },
		onStatus: () => states.push(client.inspect().status) });
	return { client, states, files };
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) { for (let n = 0; n < 100; n++) { if (test()) return; await sleep(2); } throw new Error('Wait failed'); }
(async () => {
	let calls = 0;
	const a = fixture(async () => { calls++; throw timeout(); });
	await a.client.load('1', metadata, off);
	assert.equal(calls, 1, 'Off must still perform the initial attempt');
	assert.equal(a.client.inspect().loading, false);
	assert.match(a.client.inspect().error, /UtaTen：搜索页面：网络请求超时/);
	// Empty HTTP 200 responses are service failures, not proof of no matching song.
	calls = 0; const empty = fixture(async () => { calls++; return ' \n'; });
	await empty.client.load('1', metadata, off);
	assert.equal(calls, 1); assert.match(empty.client.inspect().error, /空页面（HTTP 200）/);
	assert(!empty.client.inspect().status.includes('未找到同名歌曲')); assert.equal(empty.files.size, 0);
	await empty.client.load('1', metadata, on); assert.equal(calls, 5, 'Empty responses permit only bounded retries');
	const emptyDetail = fixture(async url => url.includes('/search') ? search : '');
	await emptyDetail.client.load('1', metadata, off); assert.match(emptyDetail.client.inspect().error, /歌词页面：.*空页面/);
	const utaSearch = '<table><tr><td><a href="/song/12/"><span class="songlist-title">試験曲</span></a></td><td><a href="/artist/1/">試験歌手</a></td></tr></table>';
	const utaSong = '<h1><span>試験曲</span><span class="artist-name">試験歌手</span></h1><div id="kashi-area">空を見る</div><div id="kashi-area-roma">sora wo miru</div>';
	const order = [];
	const automatic = fixture(async url => {
		order.push(new URL(url).hostname);
		if (url.includes('utaten.com')) return '';
		return url.includes('/search') ? utaSearch : utaSong;
	});
	await automatic.client.load('1', metadata, { ...on, externalProvider: 'auto' });
	assert.deepEqual(order, ['utaten.com', 'www.uta-net.com', 'www.uta-net.com']);
	assert.equal(automatic.client.inspect().source, 'utanet'); assert.equal(automatic.client.inspect().error, '');
	assert(!automatic.states.some(s => s.includes('自动重试')), 'Use a healthy backup before retrying the first website');
	let permanentCalls = 0, transientCalls = 0;
	const mixed = fixture(async url => { if (url.includes('utaten.com')) { permanentCalls++; throw requestError({ status: 403 }); } transientCalls++; throw timeout(); });
	await mixed.client.load('1', metadata, { ...on, externalProvider: 'auto' });
	assert.equal(permanentCalls, 1); assert.equal(transientCalls, 4);
	assert.match(mixed.client.inspect().error, /UtaTen：.*HTTP 403/); assert.match(mixed.client.inspect().error, /歌ネット：.*网络请求超时/);
	// A failed refresh keeps the old website cache but must still expose the failure.
	let offline = false;
	const retained = fixture(async url => { if (offline) throw timeout(); return url.includes('/search') ? search : song; });
	await retained.client.load('1', metadata, off); const saved = [...retained.files.values()][0]; offline = true;
	await retained.client.load('1', metadata, off, true);
	assert(retained.client.inspect().ready); assert.equal(retained.client.inspect().source, 'utaten');
	assert.match(retained.client.inspect().error, /网络请求超时/); assert.match(retained.client.inspect().status, /已有网站缓存/);
	assert.equal([...retained.files.values()][0], saved);
	offline = false; await retained.client.load('1', metadata, off, true); assert.equal(retained.client.inspect().error, '');
	// Local corrections remain usable and no longer suppress this playback's first request.
	const local = fixture(async () => { throw timeout(); });
	await local.client.ensureLocal('1', metadata, off);
	await local.client.load('1', metadata, off); assert.equal(local.client.inspect().source, 'local');
	assert.match(local.client.inspect().error, /网络请求超时/); assert(local.client.inspect().ready);
	const fallback = () => [{ text: '空', rt: 'そら' }, { text: 'を見る' }];
	const anchor = local.client.fallbackSegments('空を見る', fallback(), 'hiragana')[0].edit;
	await local.client.saveEdit(anchor, 'うみ', null, fallback);
	assert.match(local.client.inspect().error, /网络请求超时/, 'Saving a correction must not hide a website failure');
	let searches = 0, details = 0;
	const b = fixture(async url => { if (url.includes('/search')) { searches++; return search; } if (++details < 3) throw timeout(); return song; });
	await b.client.load('1', metadata, on);
	assert.equal(searches, 3, 'Each retry restarts the complete matching workflow');
	assert.equal(details, 3); assert.equal(b.client.inspect().source, 'utaten');
	assert(b.states.some(s => s.includes('自动重试（2/3）')));
	calls = 0;
	const c = fixture(async () => { calls++; throw timeout(); });
	await c.client.load('1', metadata, on); assert.equal(calls, 4, 'One initial request plus at most three retries');
	assert.equal(c.client.inspect().waitingRetry, false);
	for (const response of [{ status: 403 }, { status: 404 }, { error: 'Permanent response failure' }]) {
		calls = 0; const x = fixture(async () => { calls++; throw requestError(response); });
		await x.client.load('1', metadata, on); assert.equal(calls, 1, 'Do not loop on refusal, missing pages or permanent response errors');
	}
	calls = 0; const missing = fixture(async () => { calls++; return '<html></html>'; });
	await missing.client.load('1', metadata, on); assert.equal(calls, 2, 'Strict and title-only searches form one attempt; no match does not retry');
	let attempts = 0;
	const d = fixture(async () => { attempts++; throw timeout(); }, [60000, 60000, 60000]);
	const pending = d.client.load('1', metadata, on);
	await until(() => d.client.inspect().waitingRetry);
	d.client.setAutoRetry('off'); await pending;
	assert.equal(attempts, 1, 'Disabling cancels the wait without issuing another initial request');
	assert.equal(d.client.inspect().waitingRetry, false);
	const resumed = d.client.setAutoRetry('failed');
	await until(() => d.client.inspect().waitingRetry);
	d.client.stop(); await resumed;
	assert.equal(attempts, 2, 'Enabling after failure permits a fresh bounded attempt');
	assert.equal(d.client.inspect().songId, null);
	let first = true;
	const e = fixture(async url => { if (first) { first = false; throw timeout(); } return url.includes('/search') ? search : song; }, [60000]);
	const old = e.client.load('1', metadata, on); await until(() => e.client.inspect().waitingRetry);
	await e.client.load('2', metadata, on); await old;
	assert.equal(e.client.inspect().songId, '2'); assert.equal(e.client.inspect().source, 'utaten');
	assert(!e.states.slice(e.states.lastIndexOf('读取外部歌词缓存…') + 1).some(s => s.includes('继续使用网易云')));
	const rateLimit = requestError({ status: 429, retryAfter: '60' });
	assert(rateLimit.retryable); assert.equal(rateLimit.retryAfterMs, 60000);
	assert.match(requestError({ network: true }).message, /网络连接失败/);
	assert(requestError({ network: true }).retryable);
	assert(!requestError({ error: 'Permanent response failure' }).retryable);
	calls = 0; const longWait = fixture(async () => { calls++; throw requestError({ status: 503, retryAfter: '600' }); });
	await longWait.client.load('1', metadata, on); assert.equal(calls, 1, 'Do not shorten a server cooldown to fit the retry budget');
	console.log('Retry tests passed: off/initial, workflow retries, bounded attempts, permanent failures, cancellation, policy changes, track isolation and Retry-After.');
})().catch(error => { console.error(error); process.exitCode = 1; });
