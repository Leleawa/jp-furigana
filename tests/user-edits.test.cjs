'use strict';
const assert = require('node:assert/strict'), { JSDOM } = require('jsdom');
const { create } = require('../src/external.js'), edits = require('../src/user-edits.js'), core = require('../src/external-core.js');
const settings = { externalProvider: 'utaten' }, metadata = async () => ({ title: '試験曲', artists: ['試験歌手'] });
const line = '空と空をみる';
const record = { schema: 1, songId: '1', provider: 'utaten', title: '試験曲', artists: ['試験歌手'], url: 'https://utaten.com/lyric/test/', fetchedAt: 'test', extra: { preserved: true }, lines: [{ text: line, segments: [{ text: '空', rt: 'そら' }, { text: 'と' }, { text: '空', rt: 'そら' }, { text: 'をみる' }] }] };
const search = '<table><tr><td class="searchResult__title"><a href="/lyric/test/">試験曲</a></td><td class="searchResult__artist"><p><a>試験歌手</a></p></td></tr></table>';
const song = '<h2 class="newLyricTitle__main">試験曲</h2><h3><a href="/artist/1">試験歌手</a></h3><div class="lyricBody"><div class="hiragana"><span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>と<span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>をみる</div></div>';
const path = 'C:/Test/lyrics/jp-furigana/1.json', files = new Map([[path, JSON.stringify(record)]]);
let fail = false, requests = 0;
const client = create({ dataRoot: async () => 'C:/Test', fs: {
 mkdir: async () => true, exists: async p => files.has(p), readFileText: async p => { if (!files.has(p)) throw new Error('missing'); return files.get(p); },
 readDir: async dir => [...files.keys()].filter(p => p.startsWith(dir + '/')), remove: async p => files.delete(p),
 atomicWrite: async (p, next, expected) => { if (fail) throw new Error('disk full'); assert.equal(files.get(p) ?? null, expected); files.set(p, next); }
}, request: async url => { requests++; return url.includes('/search') ? search : song; }, parse: html => new JSDOM(html).window.document });
const segs = () => client.segments(line, 'hiragana').filter(s => s.edit);
const fallback = () => [{ text: '空', rt: 'そら' }, { text: 'をみる' }];
(async () => {
 await client.load('1', metadata, settings);
 const a = segs()[0].edit, b = segs()[1].edit;
 await Promise.all([client.saveEdit(a, 'アナタ'), client.saveEdit(b, 'うみ')]);
 let saved = JSON.parse(files.get(path));
 assert.deepEqual(saved.lines, record.lines); assert.deepEqual(saved.extra, record.extra); assert.equal(saved.schema, 1); assert.equal(saved.userEdits.length, 2);
 assert.deepEqual(segs().map(s => s.rt), ['あなた', 'うみ']);
 await assert.rejects(client.saveEdit(a, 'ほし'), /本地读音已变化/);
 assert.throws(() => edits.reading('<script>')); assert.throws(() => edits.reading('')); assert.equal(edits.reading('ｱﾅﾀ'), 'あなた');
 fail = true; await assert.rejects(client.saveEdit(segs()[0].edit, 'ほし'), /disk full/); fail = false;
 assert.equal(segs()[0].rt, 'あなた');
 await client.load('1', metadata, settings); assert.equal(requests, 0); assert.equal(segs()[0].rt, 'あなた');
 assert.equal(client.segments(line, 'katakana')[0].rt, 'アナタ');
 await client.load('1', metadata, settings, true); assert.equal(requests, 2); assert.equal(segs()[0].rt, 'あなた');
 assert.equal(JSON.parse(files.get(path)).userEdits.length, 2, 'Refreshing preserves both edits');
 await client.saveEdit(segs()[0].edit, null); assert.equal(segs()[0].rt, 'そら'); assert.equal(segs()[1].rt, 'うみ');
 await client.manage('1', settings, 'restore'); assert.equal(segs()[1].rt, 'そら');
 client.stop(); await client.ensureLocal('2', metadata, settings);
 assert(core.validRecord(JSON.parse(files.get(path.replace('1.json', '2.json'))), '2'));
 let local = client.fallbackSegments('空をみる', fallback(), 'hiragana')[0];
 await client.saveEdit(local.edit, 'うみ', null, fallback);
 assert.equal(client.fallbackSegments('空をみる', fallback(), 'katakana')[0].rt, 'ウミ');
 client.stop(); await client.load('2', metadata, settings); assert.equal(requests, 4, 'Local corrections alone must not suppress a new playback lookup');
 assert.equal(client.inspect().source, 'utaten');
 assert.equal(client.fallbackSegments('空をみる', fallback(), 'hiragana')[0].rt, 'うみ');
 const unknown = client.fallbackSegments('謎をみる', [{ text: '謎' }, { text: 'をみる' }], 'hiragana')[0];
 assert.equal(unknown.edit.original, '');
 await client.saveEdit(unknown.edit, 'なぞ', null, () => [{ text: '謎' }, { text: 'をみる' }]);
 assert.equal(client.fallbackSegments('謎をみる', [{ text: '謎' }, { text: 'をみる' }], 'hiragana')[0].rt, 'なぞ');
 files.set('C:/Test/lyrics/jp-furigana/requests', '{}'); files.set('C:/Test/lyrics/jp-furigana/2.json.write-abc', '{}');
 const listing = await client.list(settings); assert.equal(listing.rows.length, 2); assert.equal(listing.rows.find(r => r.songId === '2').edits, 2);
 assert.equal(listing.rows[0].bytes, Buffer.byteLength(files.get(path)));
 await assert.rejects(client.manage('../1', settings, 'delete'), /无效/);
 await client.manage('2', settings, 'delete'); assert(!files.has(path.replace('1.json', '2.json'))); assert(!client.inspect().ready);
 await assert.rejects(client.saveEdit(local.edit, 'そら', null, fallback), /歌曲或来源/);
 const orphan = { ...record, userEdits: [{ ...a, reading: 'あなた' }] }; orphan.lines = [{ text: line, segments: record.lines[0].segments.map((s,i) => i ? s : { ...s, rt: 'くう' }) }];
 assert.equal(edits.annotate(orphan, line, core.segmentsFor(line, core.prepare(orphan), 'hiragana'), 'hiragana')[0].rt, 'くう', 'Changed baseline retains but does not misapply an old edit');
 client.stop(); await client.ensureLocal('1', metadata, { externalProvider: 'utanet' });
 assert.equal(client.inspect().source, 'local'); assert.equal(client.segments(line, 'hiragana'), null, 'Entering editing must not enable a cached website excluded by the selected scope');
 assert.equal(client.inspect().url, '');
 console.log('User edits passed: unchanged source JSON, exact positions, concurrent/stale writes, restore, refresh, local-only/unknown readings, listing, deletion and orphan safety.');
})().catch(e => { console.error(e); process.exitCode = 1; });
