// 用歌词页上真实的官方音译，验证「词典断词 + 音译定读音」这条链路。
//   node tools/test-romaji.js
const path = require('path');
const fs = require('fs');

globalThis.__FURIGANA_DICT_LOADER__ = (p) =>
	fs.promises.readFile(p).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const kuromoji = require(path.join(__dirname, '..', 'src', 'kuromoji.js'));
const core = require(path.join(__dirname, '..', 'src', 'furigana.js'));

// [歌词原文, 网易云音译, 期望结果]  期望为 null 表示应当退回词典
const CASES = [
	[
		'愛するすべてを護れるように強くなる',
		'a i su ru su be te wo ma mo re ru yo u ni tsu yo ku na ru',
		'愛(あい)するすべてを護(まも)れるように強(つよ)くなる',
	],
	['私は私に負けない', 'wa ta shi wa wa ta shi ni ma ke na i', '私(わたし)は私(わたし)に負(ま)けない'],
	[
		'あなたに相応しい私になって',
		'a na ta ni fu sa wa shi i wa ta shi ni na tte',
		'あなたに相応(ふさわ)しい私(わたし)になって',
	],
	['隣で生きたい', 'to na ri de i ki ta i', '隣(となり)で生(い)きたい'],
	['それまで待っていてほしい', 'so re ma de ma tte i te ho shi i', 'それまで待(ま)っていてほしい'],
	[
		'どれくらい時間が経とうとも忘れたりしない',
		'do re ku ra i ji ka n ga ta to u to mo wa su re ta ri shi na i',
		'どれくらい時間(じかん)が経(た)とうとも忘(わす)れたりしない',
	],
	[
		'あなたと過ごした日々だけが光るから',
		'a na ta to su go shi ta hi bi da ke ga hi ka ru ka ra',
		'あなたと過(す)ごした日々(ひび)だけが光(ひか)るから',
	],
	['曲げない', 'ma ge na i', '曲(ま)げない'],

	// 歌手故意改读：词典会给「うんめい」「えいえん」，只有音译是对的
	['運命の糸', 'sa da me no i to', '運命(さだめ)の糸(いと)'],
	['永遠に', 'to wa ni', '永遠(とわ)に'],

	// 连续汉字跨词：`昨夜言` 是一整块汉字，必须靠词典边界切成 昨夜 / 言，
	// 否则整段读音会糊成 昨夜言(ゆうべい)
	[
		'昨夜言ってたそんな気もするわ',
		'yu u be i tte ta so n na ki mo su ru wa',
		'昨夜(ゆうべ)言(い)ってたそんな気(き)もするわ',
	],
	// 空格/标点隔开两个汉字块：锚点是空的，要并进同一个空档再按词典长度切
	[
		'私は私 貴方は貴方と',
		'wa ta shi wa wa ta shi a na ta wa a na ta to',
		'私(わたし)は私(わたし) 貴方(あなた)は貴方(あなた)と',
	],
	['明日、君と', 'a shi ta ki mi to', '明日(あした)、君(きみ)と'],

	// 夹英文，罗马字转不了，退回词典
	['Hello 世界', 'Hello se ka i', null],
];

function render(segs) {
	return segs.map((s) => (s.rt ? `${s.text}(${s.rt})` : s.text)).join('');
}

// 网易云 2.x 的歌词用 &nbsp; (U+00A0) 而不是普通空格，实测数据：
//   '作曲&nbsp;:&nbsp;林哲司'   '私は私&nbsp;貴方は貴方と'
// 这些能正确处理是因为 JS 的 \s 包含 U+00A0。谁把 \s 换成 [ ] 或 \x20，
// 2.x 上制作信息行会被注音、官方音译也会查不到，所以钉死在这里。
const NB = ' ';
function checkNbsp() {
	const cases = [
		['\\s 包含 U+00A0', /\s/.test(NB), true],
		['制作信息 (nbsp 分隔)', core.isCreditLine('作曲' + NB + ':' + NB + '林哲司'), true],
		['制作信息 (普通空格)', core.isCreditLine('作曲 : 林哲司'), true],
		['制作信息 (无空格)', core.isCreditLine('作曲:林哲司'), true],
		['歌词行不算制作信息', core.isCreditLine('曲がり角で君に会った'), false],
		[
			'lyricKey 归一化 nbsp',
			core.lyricKey('私は私' + NB + '貴方は貴方と') === core.lyricKey('私は私 貴方は貴方と'),
			true,
		],
	];
	let bad = 0;
	for (const [name, got, want] of cases) {
		if (got !== want) {
			bad++;
			console.log(`!! ${name}: 期望 ${want} 实际 ${got}`);
		} else {
			console.log(`   ${name}`);
		}
	}
	return bad;
}

kuromoji
	.builder({ dicPath: path.join(__dirname, '..', 'src', 'dict') })
	.build((err, tokenizer) => {
		if (err) throw err;
		let fail = 0;
		for (const [text, romaji, expect] of CASES) {
			const dictSegs = core.tokensToSegments(tokenizer.tokenize(text), { kana: 'hiragana' });
			const kana = core.romajiToKana(romaji);
			const segs = kana
				? core.segmentsFromReading(text, kana, dictSegs, { kana: 'hiragana' })
				: null;
			const got = segs ? render(segs) : null;

			if (got !== expect) {
				fail++;
				console.log(`!! ${text}`);
				console.log(`   音译 "${romaji}" → 假名 ${kana}`);
				console.log(`   词典 ${render(dictSegs)}`);
				console.log(`   期望 ${expect}`);
				console.log(`   实际 ${got}`);
				continue;
			}
			if (segs && segs.map((s) => s.text).join('') !== text) {
				fail++;
				console.log(`!! 片段拼接不等于原文: ${text}`);
				continue;
			}
			console.log(`   ${got === null ? '(退回词典) ' + text : got}`);
		}
		console.log('\n--- 网易云 2.x 的 &nbsp; 处理 ---');
		fail += checkNbsp();

		console.log(fail ? `\nFAIL (${fail} 处问题)` : `\nOK ${CASES.length} 个注音用例 + nbsp 检查`);
		process.exit(fail ? 1 : 0);
	});
