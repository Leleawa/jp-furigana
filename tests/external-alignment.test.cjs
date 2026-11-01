'use strict';
const assert = require('node:assert/strict');
const core = require('../src/external-core.js');
const edits = require('../src/user-edits.js');
const { target, line } = require('./fixtures/utaten-confusions.cjs');
const weekend = require('./fixtures/utaten-weekend.cjs');
const prepare = lines => core.prepare({ provider: 'utaten', lines });
const groups = prepare([line]);
const match = (text, data = groups, mode = 'hiragana') => core.segmentsFor(text, data, mode);
const pairs = segments => segments.filter(s => s.rt).map(s => [s.text, s.rt]);
for(const text of [weekend.target,'🌟「'+weekend.target+'！」']){
	const result=match(text,prepare([weekend.line]));
	assert(result,'The screenshot differs only in 終末/週末; the whole line must retain website readings');
	assert.equal(result.map(s=>s.text).join(''),text,'Keep the client original including punctuation and supplementary Unicode');
	assert.deepEqual(pairs(result),[['終末','しゅうまつ'],['旗','はた'],['送','おく']]);
}
assert.deepEqual(pairs(match(weekend.target,prepare([weekend.line]),'katakana')),[['終末','シュウマツ'],['旗','ハタ'],['送','オク']]);
const reverse=structuredClone(weekend.line);reverse.text=weekend.target;reverse.segments[0].text='終末';
assert.deepEqual(pairs(match(weekend.line.text,prepare([reverse]))),[['週末','しゅうまつ'],['旗','はた'],['送','おく']]);
assert.notEqual(core.key('週末'),core.key('終末'),'Homophones must not become global text or title aliases');
assert(!core.matches({title:'終末の手紙',artists:['試験歌手']},{title:'週末の手紙',artists:['試験歌手']}));
assert.equal(match('終末',prepare([{text:'週末',segments:[{text:'週末',rt:'しゅうまつ'}]}])),null,'A short isolated word has insufficient context');
const otherWord={text:weekend.line.text.replace('週末','週章'),segments:weekend.line.segments.map(s=>s.text==='週末'?{text:'週章',rt:'しゅうしょう'}:s)};
assert(match(weekend.target.replace('終末','終章'),prepare([otherWord])),'High-confidence full lines no longer require an approved word pair');
assert(match(weekend.target.replace('やる','いる'),prepare([weekend.line])),'Limited kana differences may also be aligned');
assert(match(weekend.target+'ね',prepare([weekend.line])),'Confirmed wording differences can include insertions');
const conflicting=structuredClone(weekend.line);conflicting.segments.find(s=>s.text==='旗').rt='ふらぐ';
assert.equal(match(weekend.target,prepare([weekend.line,conflicting])),null,'Conflicting contextual readings remain ambiguous');
const exactWeekend=structuredClone(reverse);exactWeekend.segments.find(s=>s.text==='旗').rt='ふらぐ';
assert(pairs(match(weekend.target,prepare([weekend.line,exactWeekend]))).some(([text,rt])=>text==='旗'&&rt==='ふらぐ'),'Exact website text still takes priority');
assert(core.segmentsFor(weekend.target,core.prepare({provider:'utanet',lines:[{text:weekend.line.text,romaji:'website-romaji'}]}),'hiragana',text=>{assert.equal(text,weekend.line.text);return weekend.line.segments;}),'Uta-Net also resolves the website text before mapping');
const editableRecord={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/test/',lines:[weekend.line],userEdits:[]};
const baseline=match(weekend.target,prepare(editableRecord.lines));
const editable=edits.annotate(editableRecord,weekend.target,baseline,'hiragana'),flag=editable.find(s=>s.text==='旗').edit;
assert.equal(flag.line,weekend.target);assert.equal(flag.start,2);assert.equal(flag.original,'はた');
const revised=edits.update(editableRecord,flag,'ふらぐ');
assert(edits.annotate(revised,weekend.target,baseline,'hiragana').some(s=>s.text==='旗'&&s.rt==='ふらぐ'),'User edits retain priority over the contextual website reading');
assert.equal(revised.lines[0].text,weekend.line.text,'Manual correction must not rewrite cached website lyrics');
for (const text of [target, target.replace('沖', '冲'), '「' + target + '！」']) {
	const result = match(text);
	assert(result, 'Full contextual match must use the website despite the transcription confusions');
	assert.equal(result.map(s => s.text).join(''), text, 'Never replace the client lyric text');
	assert.deepEqual(pairs(result), [['抗', 'あらが'], [text.includes('冲') ? '冲動' : '沖動', 'しょうどう'], ['暗', 'やみ'], ['彼', 'かれ'], ['包', 'つつ']]);
}
assert(pairs(match(target, groups, 'katakana')).some(([text, rt]) => text === '沖動' && rt === 'ショウドウ'));
// The confusion rules are not global text normalization or song-title aliases.
assert.notEqual(core.key('暗'), core.key('闇'));
assert.notEqual(core.key('沖動'), core.key('衝動'));
assert.equal(core.queryTitle('廻廻奇譚'), '廻廻奇譚', 'Lyric-only variants must not change search titles');
assert(!core.matches({ title: '廻廻奇譚', artists: ['試験歌手'] }, { title: '回回奇譚', artists: ['試験歌手'] }));
assert(!core.matches({ title: '暗の手紙', artists: ['試験歌手'] }, { title: '闇の手紙', artists: ['試験歌手'] }));
assert.equal(match('沖動の暗'), null, 'Short fragments lack context');
assert.equal(match(target.replace('彼', '君')), null, 'Do not use fuzzy edit distance for a different lyric');
assert.equal(match(target.replace('が', 'も')), null, 'Kana changes must not be inferred');
assert.equal(match(target + 'よ'), null, 'Do not guess an insertion/deletion');
const unrelated = { text: '沖縄で見た空は青かった', segments: [{ text: '沖縄', rt: 'おきなわ' }, { text: 'で見た空は青かった' }] };
assert(match(unrelated.text.replace('沖', '衝'), prepare([unrelated])), 'A high-confidence full line does not depend on specific kanji pairs');
const tooMany = { text: '闇の闇の闇の中を歩いた', segments: [{ text: '闇', rt: 'やみ' }, { text: 'の闇の闇の中を歩いた' }] };
assert.equal(match(tooMany.text.replaceAll('闇', '暗'), prepare([tooMany])), null, 'Limit substitutions even in a long line');
const ambiguous = structuredClone(line);
ambiguous.segments.find(s => s.text === '闇').rt = 'くらやみ';
assert.equal(match(target, prepare([line, ambiguous])), null, 'Conflicting repetitions cannot be resolved without timestamps');
const exact = structuredClone(line);
exact.segments = exact.segments.map(s => s.text === '衝動' ? { text: '沖動', rt: 'おきどう' } : s.text === '闇' ? { text: '暗', rt: 'あん' } : s);
exact.text = exact.segments.map(s => s.text).join('');
assert(pairs(match(target, prepare([line, exact]))).some(([text, rt]) => text === '暗' && rt === 'あん'), 'Exact website text takes priority over contextual matching');
const merged = prepare([{ text: '星が光る', segments: [{ text: '星', rt: 'ほし' }, { text: 'が光る' }] }, line]);
assert(match('星が光る ' + target, merged), 'Adjacent website lines may be merged by the client');
assert(core.segmentsFor(target, core.prepare({ provider: 'utanet', lines: [{ text: line.text, romaji: 'website-romaji' }] }), 'hiragana', text=>{assert.equal(text,line.text);return line.segments;}));
// Independent synthetic sentences cover the script variants found near the screenshot.
for (const [client, website] of [['彈', '弾'], ['焰', '焔'], ['回', '廻'], ['涂', '塗'], ['傳', '伝'], ['說', '説'], ['咒', '呪'], ['駈', '駆'], ['溯', '遡'], ['淚', '涙'], ['絕', '絶']]) {
	const text = '🌟「' + client + 'の文字」';
	const source = { text: website + 'の文字', segments: [{ text: website, rt: 'あ' }, { text: 'の文字' }] };
	const result = match(text, prepare([source]));
	assert.equal(result.map(s => s.text).join(''), text);
	assert.deepEqual(pairs(result), [[client, 'あ']], 'Original offsets survive punctuation and supplementary Unicode');
}
console.log('External alignment passed: screenshot readings, original glyphs, variants, contextual limits, exact priority, ambiguity and provider isolation.');
