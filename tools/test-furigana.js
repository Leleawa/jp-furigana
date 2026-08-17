// 在 node 里跑一遍注音核心逻辑，不需要网易云。
//   node tools/test-furigana.js
// 也可以直接传句子：
//   node tools/test-furigana.js "夜に駆ける"
const path = require('path');
const fs = require('fs');

// 浏览器构建里的词典读取器走 XHR，node 里没有；用补丁留下的钩子接上 fs
globalThis.__FURIGANA_DICT_LOADER__ = (p) =>
	fs.promises.readFile(p).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const kuromoji = require(path.join(__dirname, '..', 'src', 'kuromoji.js'));
const core = require(path.join(__dirname, '..', 'src', 'furigana.js'));

const LINES = process.argv.slice(2).length
	? process.argv.slice(2)
	: [
			'沈むように溶けてゆくように',
			'二人だけの空が広がる夜に',
			'「さよなら」だけだった',
			'君の全てを僕は知らない',
			'持ち帰る想いは行方知れず',
			'一人ぼっちの夜を数えて',
			'今日も明日も昨日のように',
			'走り出した午前四時の街',
			'綺麗な景色を見せてあげる',
			'Hello, 世界！ 2023年10月',
			'心が躍る音',
			'愛してるって言えなくて',
	  ];

function render(segments) {
	return segments
		.map((s) => (s.rt ? `${s.text}(${s.rt})` : s.text))
		.join('');
}

kuromoji
	.builder({ dicPath: path.join(__dirname, '..', 'src', 'dict') })
	.build((err, tokenizer) => {
		if (err) throw err;
		let fail = 0;
		for (const line of LINES) {
			const tokens = tokenizer.tokenize(line);
			const segs = core.tokensToSegments(tokens);
			// 断言：片段拼起来必须等于原文，不能丢字或加字
			const joined = segs.map((s) => s.text).join('');
			const ok = joined === line;
			if (!ok) fail++;
			console.log(`${ok ? '  ' : '!!'} ${render(segs)}`);
			if (!ok) console.log(`     期望 "${line}" 实际 "${joined}"`);
			// 断言：at 下标要指向原文的正确位置
			for (const s of segs) {
				if (s.rt == null) continue;
				if (line.substr(s.at, s.text.length) !== s.text) {
					fail++;
					console.log(
						`     偏移错误: at=${s.at} text=${s.text} 实际="${line.substr(
							s.at,
							s.text.length
						)}"`
					);
				}
			}
		}
		console.log(fail ? `\nFAIL (${fail} 处问题)` : `\nOK ${LINES.length} 行`);
		process.exit(fail ? 1 : 0);
	});
