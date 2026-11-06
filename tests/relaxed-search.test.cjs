'use strict';
const assert = require('node:assert/strict'), { JSDOM } = require('jsdom'), { create, requestError } = require('../src/external.js');
const core = require('../src/external-core.js');
const lines = ['青い空を見ながら手紙を書いている', '遠い町へ歩いてゆく明日の朝まで'];
const otherLines = ['違う歌の中で朝を待ち続ける', '知らない名前を呼んでみたのです'];
const row = (id, artist = '別表記', title = '試験曲', href = `/lyric/${id}/`) => `<tr><td class="searchResult__title"><a href="${href}">${title}</a></td><td class="searchResult__artist"><p><a>${artist}</a></p></td></tr>`;
const withPreview = (row, lines) => row.replace('</tr>', `<td class="lyricList__beginning"><a>${lines.join(' ')}…</a></td></tr>`);
const page = (lyrics, artist = '別表記', title = '試験曲') => `<h2 class="newLyricTitle__main">${title}</h2><h3><a href="/artist/1">${artist}</a></h3><div class="lyricBody"><div class="hiragana">` + lyrics.map(text => '<span class="ruby"><span class="rb">' + text[0] + '</span><span class="rt">あ</span></span>' + text.slice(1)).join('<br>') + '</div></div>';
const metadata = async () => ({ title: '試験曲', artists: ['試験歌手'], lyrics: lines });
function fixture(request) {
 const files = new Map(), states = [];
 const client = create({ dataRoot: async () => 'C:/Test', request, retryDelays: [0,0,0], parse: html => new JSDOM(html).window.document,
  fs: { mkdir: async () => true, exists: async p => files.has(p), readFileText: async p => files.get(p), writeFileText: async (p,v) => { files.set(p,v); return true; } }, onStatus: () => states.push(client.inspect().status) });
 return { client, states, files };
}
const settings = { externalProvider: 'utaten', externalAutoRetry: 'failed' };
(async () => {
 let calls = []; const a = fixture(async url => { calls.push(url); if (url.includes('artist_name=')) return '<table></table>'; if (url.includes('/search')) return '<table>' + row('wrong') + row('right') + '</table>'; return url.includes('/wrong/') ? page(otherLines) : page(lines); });
 await a.client.load('1', metadata, settings); assert.equal(a.client.inspect().source, 'utaten'); assert(a.client.inspect().url.includes('/right/'));
 assert.equal(calls.length, 4); assert(!a.states.some(s => s.includes('自动重试')), 'Strict search, title-only search and candidate verification are one attempt');

 const rightTitle = 'Pray(TVアニメ「殺戮の天使」ED主題歌)';
 const dottedTitle = 'PRAY.(第95回センバツ MBS 公式テーマソング)';
 const exactTitles = ['Pray(TVアニメ 銀魂 OP主題歌)', 'pray(ドラマ「院内警察」主題歌)', 'Pray', 'Ｐｒａｙ（映画「架空」日本版主題歌）', 'pray(セラフィム・コール OP)', 'pray', 'PRAY'];
 const otherTitles = ['PRAYER', 'prayers', "Livin'On A Prayer", dottedTitle, 'Pray for love', 'Pray (Reprise)', 'Pr ay', 'Re:pray'];
 const exactRows = exactTitles.map((title, i) => {
  const entry = row('exact' + i, '別表記', title);
  return i === 0 ? withPreview(entry, lines) : entry; // A matching excerpt still needs detail verification.
 }).join('');
 const otherRows = otherTitles.map((title, i) => row('excluded' + i, 'Akie秋絵', title)).join('');
 const nextPray = '<link rel="next" href="/search/=/title=Pray/artist_name=/page=2/">';
 const targetDetails = [], searchPages = [];
 const large = fixture(async url => {
  const { pathname, searchParams } = new URL(url);
  if (pathname === '/search') {
   if (searchParams.has('artist_name')) return '<table>' + otherRows + '</table>';
   assert.equal(searchParams.get('title'), 'Pray');
   const current = searchParams.get('page') || '1'; searchPages.push(current);
   if (current === '1') return nextPray + '<table>' + otherRows + exactRows + '</table>';
   assert.equal(current, '2');
   return '<table>' + row('exact0', '別表記', exactTitles[0], 'https://www.utaten.com/lyric/exact0/?utm_source=test') + row('rachel', 'レイチェル(千菅春香)', rightTitle) + '</table>';
  }
  const id = pathname.split('/')[2]; targetDetails.push(id);
  if (id === 'rachel') return page(lines, 'レイチェル(千菅春香)', 'Pray');
  if (id === 'exact1') return page([], '別表記', 'Pray'); // A detail without readings must not end the search.
  if (id === 'exact2') return page(lines, '別表記', 'Pray.'); // Do not accept the wrong detail title even if lyrics match.
  return page(otherLines, '別表記', 'Pray');
 });
 await large.client.load('2', async () => ({ title: 'Pray', artists: ['Akie秋絵'], lyrics: lines }), settings);
 assert.deepEqual(searchPages, ['1', '2']);
 assert.deepEqual(targetDetails, [...exactTitles.map((_, i) => 'exact' + i), 'rachel']);
 assert.equal(large.client.inspect().url, 'https://utaten.com/lyric/rachel/');
 assert.equal(core.queryTitle(dottedTitle), 'PRAY.');
 assert.equal(core.queryTitle('Pray (Reprise)'), 'Pray (Reprise)');
 assert.equal(core.nextUtatenSearchPage(new JSDOM(nextPray).window.document, 'https://utaten.com/search?title=PRAY'), 'https://utaten.com/search?title=PRAY&page=2');
 for (const href of ['https://example.com/search?title=Pray&page=2', '/search?title=PRAY.&page=2', '/search?title=Pray&page=1', '/search?title=Pray&artist_name=other&page=2']) {
  assert.equal(core.nextUtatenSearchPage(new JSDOM(`<link rel="next" href="${href}">`).window.document, 'https://utaten.com/search?title=Pray'), null);
 }

 const previewDetails = [];
 const previews = fixture(async url => {
  if (url.includes('artist_name=')) return '<table></table>';
  if (url.includes('/search')) return '<table>' + withPreview(row('unrelated'), otherLines) + withPreview(row('too-short'), [lines[0]]) +
   withPreview(row('different-title', '別表記', '試験曲.'), lines) + withPreview(row('right'), lines) + '</table>';
  previewDetails.push(new URL(url).pathname);
  return page(lines);
 });
 await previews.client.load('1', metadata, settings);
 assert.equal(previews.client.inspect().url, 'https://utaten.com/lyric/right/');
 assert.deepEqual(previewDetails, ['/lyric/right/'], 'Only a title with a long matching excerpt should need its detail fetched when it verifies');

 const ambiguous = fixture(async url => {
  if (url.includes('artist_name=')) return '<table></table>';
  if (url.includes('page=2')) return '<table>' + row('b') + '</table>';
  if (url.includes('/search')) return '<link rel="next" href="/search?title=' + encodeURIComponent('試験曲') + '&page=2"><table>' + row('a') + '</table>';
  return page(lines);
 });
 await ambiguous.client.load('1', metadata, settings); assert.equal(ambiguous.files.size, 0); assert(ambiguous.client.inspect().status.includes('多个版本'));
 const insufficient = fixture(async url => url.includes('/search') ? '<table>' + row('a') + '</table>' : page([lines[0], '知らない名前を呼んでみたのです']));
 await insufficient.client.load('1', metadata, settings); assert.equal(insufficient.files.size, 0);
 let searches = 0, failed = false;
 const retry = fixture(async url => { if (url.includes('artist_name=')) { searches++; return '<table></table>'; } if (url.includes('/search')) return '<table>' + row('a') + '</table>'; if (!failed) { failed = true; throw requestError({ timeout: true }); } return page(lines); });
 await retry.client.load('1', metadata, settings); assert.equal(searches, 2, 'Network retry restarts one whole matching workflow'); assert.equal(retry.client.inspect().source, 'utaten');
 console.log('Relaxed matching passed: exact titles, work suffixes, paginated candidates, multiple lyric fragments, ambiguous matches and retry.');
})().catch(e => { console.error(e); process.exitCode = 1; });
