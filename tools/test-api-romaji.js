// 用真实的 /api/song/lyric 响应（tools/fixtures/）验证「lrc + romalrc → 原文/音译映射」
// 这条链路，并把每一行走完整的注音流程。全程离线。
//   node tools/test-api-romaji.js
const path = require('path');
const fs = require('fs');

globalThis.__FURIGANA_DICT_LOADER__ = (p) =>
	fs.promises.readFile(p).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const kuromoji = require(path.join(__dirname, '..', 'src', 'kuromoji.js'));
const core = require(path.join(__dirname, '..', 'src', 'furigana.js'));

// fixture 是真实接口响应，含整首歌词，没有提交到仓库（见 .gitignore），
// 所以 CI 上会跳过这个测试。要在本地跑，先抓一份：
//   curl -s "https://music.163.com/api/song/lyric?lv=-1&kv=-1&tv=-1&rv=-1&id=3406947013" \
//     -o tools/fixtures/lyric-3406947013.json
const FIXTURE = path.join(__dirname, 'fixtures', 'lyric-3406947013.json');
if (!fs.existsSync(FIXTURE)) {
	console.log('SKIP 缺少 fixture: ' + path.relative(process.cwd(), FIXTURE));
	console.log('     抓取方式见本文件开头的注释');
	process.exit(0);
}
const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

const map = core.buildRomajiMap(data.lrc.lyric, data.romalrc.lyric);
const lrcLines = core.parseLrc(data.lrc.lyric);

// 制作信息行（作词/作曲/编曲）没有音译，本来就配不上
const RE_CREDIT = /^\s*(作词|作詞|作曲|编曲|編曲)\s*[:：]/;
const lyricLines = lrcLines.filter((l) => !RE_CREDIT.test(l.text));
const credits = lrcLines.length - lyricLines.length;

let fail = 0;
const missing = lyricLines.filter((l) => !map.has(core.lyricKey(l.text)));
console.log(`lrc ${lrcLines.length} 行（制作信息 ${credits} 行），映射 ${map.size} 条`);
if (missing.length) {
	fail++;
	console.log(`!! 有 ${missing.length} 行歌词没配到音译：`);
	for (const m of missing.slice(0, 5)) console.log(`   [${m.time}] ${m.text}`);
}

kuromoji
	.builder({ dicPath: path.join(__dirname, '..', 'src', 'dict') })
	.build((err, tokenizer) => {
		if (err) throw err;
		let romajiUsed = 0;
		let dictUsed = 0;
		for (const line of lyricLines) {
			const text = line.text;
			if (!core.hasKanji(text)) continue;
			const dictSegs = core.tokensToSegments(tokenizer.tokenize(text), { kana: 'hiragana' });
			const romaji = map.get(core.lyricKey(text));
			const kana = romaji ? core.romajiToKana(romaji) : null;
			const segs = kana
				? core.segmentsFromReading(text, kana, dictSegs, { kana: 'hiragana' })
				: null;

			const used = segs || dictSegs;
			if (segs) romajiUsed++;
			else dictUsed++;

			// 片段拼回去必须等于原文
			if (used.map((s) => s.text).join('') !== text) {
				fail++;
				console.log(`!! 片段拼接不等于原文: ${text}`);
			}
			console.log(
				`   ${segs ? '音译' : '词典'}  ${used
					.map((s) => (s.rt ? `${s.text}(${s.rt})` : s.text))
					.join('')}`
			);
		}
		console.log(`\n有汉字的行：音译 ${romajiUsed}，退回词典 ${dictUsed}`);
		if (romajiUsed === 0) {
			fail++;
			console.log('!! 一行都没用上音译，链路是断的');
		}
		console.log(fail ? `\nFAIL (${fail} 处问题)` : '\nOK');
		process.exit(fail ? 1 : 0);
	});
