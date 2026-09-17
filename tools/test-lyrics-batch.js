// 对 tools/fixtures/ 里所有歌词响应跑完整注音流程，统计音译 / 词典两条路的覆盖与分歧。
// fixture 用 tools/fetch-lyrics.js 抓，不进仓库。
// 终端只打印统计和词级别分歧；逐行结果写到 tools/fixtures/report.txt。
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
	console.log('SKIP 没有 fixture，先跑 node tools/fetch-lyrics.js <关键词>...');
	process.exit(0);
}
const RE_CREDIT = /^\s*(作词|作詞|作曲|编曲|編曲)\s*[:：]/;
const fmt = (segs) => segs.map((s) => (s.rt ? `${s.text}(${s.rt})` : s.text)).join('');

kuromoji.builder({ dicPath: path.join(__dirname, '..', 'src', 'dict') }).build((err, tokenizer) => {
	if (err) throw err;
	const report = [];
	const diffs = new Map(); // "词|音译读音|词典读音" -> 次数
	let fail = 0;
	const total = { lines: 0, romaji: 0, noMap: 0, alignFail: 0 };

	for (const f of files) {
		const data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
		const map = core.buildRomajiMap(data.lrc.lyric, data.romalrc.lyric);
		const lines = core.parseLrc(data.lrc.lyric).filter((l) => !RE_CREDIT.test(l.text) && core.hasKanji(l.text));
		const st = { lines: lines.length, romaji: 0, noMap: 0, alignFail: 0 };
		report.push(`==== ${f}`);

		for (const { text } of lines) {
			const dictSegs = core.tokensToSegments(tokenizer.tokenize(text), { kana: 'hiragana' });
			const romaji = map.get(core.lyricKey(text));
			const kana = romaji ? core.romajiToKana(romaji) : null;
			const segs = kana ? core.segmentsFromReading(text, kana, dictSegs, { kana: 'hiragana' }) : null;
			let tag;
			if (segs) (st.romaji++, (tag = '音译'));
			else if (!romaji) (st.noMap++, (tag = '无映射'));
			else (st.alignFail++, (tag = '对不上'));

			const used = segs || dictSegs;
			if (used.map((s) => s.text).join('') !== text) {
				fail++;
				tag += ' !!拼接不等于原文';
			}
			report.push(`[${tag}] ${fmt(used)}`);
			if (!segs && romaji) report.push(`        音译: ${kana}`);

			if (segs) {
				const byAt = new Map(dictSegs.filter((s) => s.rt).map((s) => [s.at, s]));
				for (const s of segs) {
					if (!s.rt) continue;
					const d = byAt.get(s.at);
					if (d && d.text === s.text && d.rt !== s.rt) {
						const k = `${s.text}|${s.rt}|${d.rt}`;
						diffs.set(k, (diffs.get(k) || 0) + 1);
						report.push(`        分歧 ${s.text}: 音译=${s.rt} 词典=${d.rt}`);
					}
				}
			}
		}
		console.log(`${f.padEnd(22)} 含汉字 ${String(st.lines).padStart(3)}  音译 ${String(st.romaji).padStart(3)}  无映射 ${st.noMap}  对不上 ${st.alignFail}`);
		for (const k in total) total[k] += st[k];
	}

	console.log(`\n合计 含汉字 ${total.lines}  音译 ${total.romaji}  无映射 ${total.noMap}  对不上 ${total.alignFail}`);
	console.log(`\n音译与词典读音分歧（${diffs.size} 种）：`);
	for (const [k, n] of [...diffs].sort((a, b) => b[1] - a[1])) {
		const [w, r, d] = k.split('|');
		console.log(`  ${String(n).padStart(2)}×  ${w}  音译=${r}  词典=${d}`);
	}
	fs.writeFileSync(path.join(DIR, 'report.txt'), report.join('\n') + '\n');
	console.log(`\n逐行结果: ${path.relative(process.cwd(), path.join(DIR, 'report.txt'))}`);
	console.log(fail ? `\nFAIL (${fail} 行拼接出错)` : '\nOK');
	process.exit(fail ? 1 : 0);
});
