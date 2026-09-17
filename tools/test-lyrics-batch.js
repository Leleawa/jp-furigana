// 对 tools/fixtures/ 里所有歌词响应跑完整注音流程，把问题自动归类、按出现次数排序。
// fixture 用 tools/fetch-lyrics.js 抓，不进仓库。
// 终端只打印统计和词级别的分歧；逐行结果按类别写到 tools/fixtures/report.txt。
// tools/known-readings.txt 里登记过的「词 读音」（确认音译是对的）不再列为分歧。
//   node tools/test-lyrics-batch.js
const path = require('path');
const fs = require('fs');

globalThis.__FURIGANA_DICT_LOADER__ = (p) =>
	fs.promises.readFile(p).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const kuromoji = require(path.join(__dirname, '..', 'src', 'kuromoji.js'));
const core = require(path.join(__dirname, '..', 'src', 'furigana.js'));

const DIR = path.join(__dirname, 'fixtures');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^lyric-\d+\.json$/.test(f)) : [];
if (!files.length) {
	console.log('SKIP 没有 fixture，先跑 node tools/fetch-lyrics.js');
	process.exit(0);
}

const KNOWN_FILE = path.join(__dirname, 'known-readings.txt');
const known = new Set(
	(fs.existsSync(KNOWN_FILE) ? fs.readFileSync(KNOWN_FILE, 'utf8') : '')
		.split('\n')
		.map((l) => l.replace(/#.*/, '').trim())
		.filter(Boolean)
		.map((l) => l.split(/\s+/).join(' '))
);

const K = core.KANJI_RANGE;
const RE_PAREN = /[（(][^）)]*[）)]/;
const RE_KATA_OKURI = new RegExp(`[${K}][ァ-ヺ]`);
const RE_LATIN = /[A-Za-zＡ-Ｚａ-ｚ0-9０-９]/;

const fmt = (segs) => segs.map((s) => (s.rt ? `${s.text}(${s.rt})` : s.text)).join('');
const inc = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);
const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);

// 清浊、促音、小写假名都抹平后相同：连浊之类，多半不算错
const DAKU = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';
const SEI = 'かきくけこさしすせそたちつてとはひふへほはひふへほ';
const SMALL = 'ぁぃぅぇぉっゃゅょ';
const BIG = 'あいうえおつやゆよ';
const flat = (s) =>
	[...s].map((c) => (DAKU.includes(c) ? SEI[DAKU.indexOf(c)] : SMALL.includes(c) ? BIG[SMALL.indexOf(c)] : c)).join('');

function classifyMiss(text, dictSegs) {
	if (RE_PAREN.test(text)) return '括号（自带注音 / 和声）';
	if (dictSegs.some((s) => !s.rt && new RegExp(`[${K}]`).test(s.text))) return '词典读不出的汉字';
	if (RE_LATIN.test(text)) return '夹英文 / 数字';
	if (RE_KATA_OKURI.test(text)) return '汉字后紧跟片假名';
	return '其他';
}

kuromoji.builder({ dicPath: path.join(__dirname, '..', 'src', 'dict') }).build((err, tokenizer) => {
	if (err) throw err;
	const byCat = new Map(); // 类别 -> 行列表
	const add = (cat, line) => (byCat.get(cat) || byCat.set(cat, []).get(cat)).push(line);
	const badSyl = new Map(); // 转不出的音节
	const diffs = new Map(); // "词 音译 词典" -> 次数
	const rendaku = new Map();
	const worst = [];
	let fail = 0;
	const total = { lines: 0, romaji: 0, author: 0, noMap: 0, convFail: 0, alignFail: 0 };

	for (const f of files) {
		let data;
		try {
			data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
		} catch (e) {
			continue; // 抓取脚本还在写
		}
		const map = core.buildRomajiMap(data.lrc.lyric, data.romalrc.lyric);
		const lines = core
			.parseLrc(data.lrc.lyric)
			.filter((l) => !core.isCreditLine(l.text) && core.hasKanji(l.text));
		const id = f.replace(/\D/g, '');
		let miss = 0;

		for (const { text } of lines) {
			total.lines++;
			const dictSegs = core.tokensToSegments(tokenizer.tokenize(text), { kana: 'hiragana' });
			if (dictSegs.map((s) => s.text).join('') !== text) {
				fail++;
				add('!! 拼接不等于原文', `${id}  ${text}`);
			}
			const romaji = map.get(core.lyricKey(text));
			if (!romaji) {
				total.noMap++;
				miss++;
				add('无映射', `${id}  ${text}`);
				continue;
			}
			const kana = core.romajiToKana(romaji);
			if (!kana) {
				total.convFail++;
				miss++;
				const bad = romaji.split(/\s+/).filter((s) => s && core.romajiToKana(s) == null);
				for (const s of bad) inc(badSyl, s.toLowerCase());
				add('罗马音转不出', `${id}  ${text}\n        ${bad.join(' ')}`);
				continue;
			}
			const segs = core.segmentsFromReading(text, kana, dictSegs, { kana: 'hiragana' });
			if (!segs && dictSegs.every((s) => !s.rt || s.fixed)) {
				// 汉字全都有作词者自带的注音，词典结果就是最终结果，不算问题
				total.author++;
				continue;
			}
			if (!segs) {
				total.alignFail++;
				miss++;
				add(`对不上 · ${classifyMiss(text, dictSegs)}`, `${id}  ${fmt(dictSegs)}\n        音译: ${kana}`);
				continue;
			}
			total.romaji++;
			if (segs.map((s) => s.text).join('') !== text) {
				fail++;
				add('!! 拼接不等于原文', `${id}  ${text}`);
			}

			const byAt = new Map(dictSegs.filter((s) => s.rt).map((s) => [s.at, s]));
			for (const s of segs) {
				const d = s.rt && byAt.get(s.at);
				if (!d || d.text !== s.text || d.rt === s.rt) continue;
				const key = `${s.text} ${s.rt} ${d.rt}`;
				if (known.has(`${s.text} ${s.rt}`)) continue;
				if (flat(s.rt) === flat(d.rt)) {
					inc(rendaku, key);
					continue;
				}
				inc(diffs, key);
				add('分歧', `${id}  ${fmt(segs)}\n        ${s.text}: 音译=${s.rt} 词典=${d.rt}`);
			}
		}
		if (lines.length >= 10) worst.push([id, miss, lines.length]);
	}

	const pct = (n) => `${((n / total.lines) * 100).toFixed(1)}%`;
	console.log(`${files.length} 首，含汉字 ${total.lines} 行`);
	console.log(`  用上音译   ${total.romaji}  ${pct(total.romaji)}`);
	console.log(`  作词者注音 ${total.author}  ${pct(total.author)}`);
	console.log(`  无映射     ${total.noMap}  ${pct(total.noMap)}`);
	console.log(`  转不出     ${total.convFail}  ${pct(total.convFail)}`);
	console.log(`  对不上     ${total.alignFail}  ${pct(total.alignFail)}`);

	console.log('\n退回词典的行，按类别：');
	for (const [cat, list] of [...byCat].filter(([c]) => c !== '分歧').sort((a, b) => b[1].length - a[1].length))
		console.log(`  ${String(list.length).padStart(5)}  ${cat}`);

	console.log('\n转不出的音节（前 20）：');
	console.log('  ' + top(badSyl, 20).map(([s, n]) => `${s}×${n}`).join('  '));

	console.log('\n退回最多的歌（至少 10 行，按比例）：');
	for (const [id, miss, n] of worst.sort((a, b) => b[1] / b[2] - a[1] / a[2]).slice(0, 10))
		console.log(`  ${id.padEnd(12)} ${miss}/${n}`);

	console.log(`\n读音分歧 ${diffs.size} 种（另有清浊/促音差 ${rendaku.size} 种，已折叠），前 40：`);
	for (const [k, n] of top(diffs, 40)) {
		const [w, r, d] = k.split(' ');
		console.log(`  ${String(n).padStart(3)}×  ${w}  音译=${r}  词典=${d}`);
	}

	const out = [];
	for (const [cat, list] of byCat) out.push(`==== ${cat}（${list.length}）`, ...list, '');
	fs.writeFileSync(path.join(DIR, 'report.txt'), out.join('\n'));
	console.log(`\n逐行结果: ${path.relative(process.cwd(), path.join(DIR, 'report.txt'))}`);
	console.log(fail ? `\nFAIL (${fail} 行拼接出错)` : '\nOK');
	process.exit(fail ? 1 : 0);
});
