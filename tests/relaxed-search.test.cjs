'use strict';
const assert = require('node:assert/strict'), { JSDOM } = require('jsdom'), { create, requestError } = require('../src/external.js');
const lines = ['青い空を見ながら手紙を書いている', '遠い町へ歩いてゆく明日の朝まで'];
const row = (id, artist = '別表記') => `<tr><td class="searchResult__title"><a href="/lyric/${id}/">試験曲</a></td><td class="searchResult__artist"><p><a>${artist}</a></p></td></tr>`;
const page = (lyrics, artist = '別表記') => `<h2 class="newLyricTitle__main">試験曲</h2><h3><a href="/artist/1">${artist}</a></h3><div class="lyricBody"><div class="hiragana">` + lyrics.map(text => '<span class="ruby"><span class="rb">' + text[0] + '</span><span class="rt">あ</span></span>' + text.slice(1)).join('<br>') + '</div></div>';
const metadata = async () => ({ title: '試験曲', artists: ['試験歌手'], lyrics: lines });
function fixture(request) {
 const files = new Map(), states = [];
 const client = create({ dataRoot: async () => 'C:/Test', request, retryDelays: [0,0,0], parse: html => new JSDOM(html).window.document,
  fs: { mkdir: async () => true, exists: async p => files.has(p), readFileText: async p => files.get(p), writeFileText: async (p,v) => { files.set(p,v); return true; } }, onStatus: () => states.push(client.inspect().status) });
 return { client, states, files };
}
const settings = { externalProvider: 'utaten', externalAutoRetry: 'failed' };
(async () => {
 let calls = []; const a = fixture(async url => { calls.push(url); if (url.includes('artist_name=')) return '<table></table>'; if (url.includes('/search')) return '<table>' + row('wrong') + row('right') + '</table>'; return url.includes('/wrong/') ? page(['違う歌の中で朝を待ち続ける', '知らない名前を呼んでみたのです']) : page(lines); });
 await a.client.load('1', metadata, settings); assert.equal(a.client.inspect().source, 'utaten'); assert(a.client.inspect().url.includes('/right/'));
 assert.equal(calls.length, 4); assert(!a.states.some(s => s.includes('自动重试')), 'Strict search, title-only search and candidate verification are one attempt');
 const ambiguous = fixture(async url => url.includes('/search') ? '<table>' + row('a') + row('b') + '</table>' : page(lines));
 await ambiguous.client.load('1', metadata, settings); assert.equal(ambiguous.files.size, 0); assert(ambiguous.client.inspect().status.includes('多个版本'));
 const insufficient = fixture(async url => url.includes('/search') ? '<table>' + row('a') + '</table>' : page([lines[0], '知らない名前を呼んでみたのです']));
 await insufficient.client.load('1', metadata, settings); assert.equal(insufficient.files.size, 0);
 let searches = 0, failed = false;
 const retry = fixture(async url => { if (url.includes('artist_name=')) { searches++; return '<table></table>'; } if (url.includes('/search')) return '<table>' + row('a') + '</table>'; if (!failed) { failed = true; throw requestError({ timeout: true }); } return page(lines); });
 await retry.client.load('1', metadata, settings); assert.equal(searches, 2, 'Network retry restarts one whole matching workflow'); assert.equal(retry.client.inspect().source, 'utaten');
 console.log('Relaxed matching passed: title-only search, multiple lyric fragments, false/ambiguous matches rejected, one workflow per attempt.');
})().catch(e => { console.error(e); process.exitCode = 1; });
