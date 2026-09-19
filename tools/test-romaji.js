// 用歌词页上真实的官方音译，验证「词典断词 + 音译定读音」这条链路。
//   node tools/test-romaji.js
const path = require('path');
const fs = require('fs');

globalThis.__FURIGANA_DICT_LOADER__ = (p) =>
	fs.promises.readFile(p).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

const kuromoji = require(path.join(__dirname, '..', 'src', 'kuromoji.js'));
const core = require(path.join(__dirname, '..', 'src', 'furigana.js'));

// [歌词原文, 网易云音译, 期望结果]  期望为 null 表示应当退回词典；
// 音译为 null 的用例只检查词典结果。期望里的 [..] 是 hidden 片段
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

	// 四つ仮名：音译只有 ji/zu，ヂ/ヅ 要从词典读音补回来
	[
		'君が元気になれるまで続けます',
		'ki mi ga ge n ki ni na re ru ma de tsu zu ke ma su',
		'君(きみ)が元気(げんき)になれるまで続(つづ)けます',
	],
	[
		'惑い漂う散り散りの星 雲が隠す',
		'ma do i ta da yo u chi ri ji ri no ho shi ku mo ga ka ku su',
		'惑(まど)い漂(ただよ)う散(ち)り散(ぢ)りの星(ほし) 雲(くも)が隠(かく)す',
	],

	// 读音里恰好含有后面锚点的假名：昨日(きのう)の → キ[ノ]ウノ，
	// 懒惰匹配会在第一个 ノ 处断开，得到 昨日(き) の 僕(うのぼく)（issue #5）
	[
		'だってもう昨日の僕らにおさらば',
		'da tte mo u ki no u no bo ku ra ni o sa ra ba',
		'だってもう昨日(きのう)の僕(ぼく)らにおさらば',
	],
	['昨日の宿題は', 'ki no u no shu ku da i wa', '昨日(きのう)の宿題(しゅくだい)は'],
	[
		'言わせてよ昨日の寂しさに',
		'i wa se te yo ki no u no sa bi shi sa ni',
		'言(い)わせてよ昨日(きのう)の寂(さび)しさに',
	],

	// 单独的 n 是一拍：不能和后面的拍拼成 nyo / na
	['青年よ', 'se i ne n yo', '青年(せいねん)よ'],
	['恋愛の話', "re n'a i no ha na shi", '恋愛(れんあい)の話(はなし)'],
	['原因は', 'ge n i n wa', '原因(げんいん)は'],

	// 音译写法和原文字形不一致的地方
	['ちっちゃな町', 'chi tcha na ma chi', 'ちっちゃな町(まち)'],
	['すげぇ話', 'su ge e ha na shi', 'すげぇ話(はなし)'],
	['ぎゅっと手を', 'gi yu tto te wo', 'ぎゅっと手(て)を'],
	['メロディーの中', 'me ro dii no na ka', 'メロディーの中(なか)'],
	['ちょっと待って', 'cho to ma tte', 'ちょっと待(ま)って'],

	// 拗音被拆成两拍写，小写假名从词典补回
	['昼夜逆転', 'chu u ya gi ya ku te n', '昼夜(ちゅうや)逆転(ぎゃくてん)'],

	// 词典读不出的简体字 / 英文也占读音：挨着它的空档留词典读音，其余照用音译
	['荷物を背负った', 'ni mo tsu wo se o tta', '荷物(にもつ)を背(せ)负った'],
	['One more 季節よ', 'o ne mo re ki se tsu yo', null],

	// 重复演唱，音译多出一截：不能整段糊到一个字上
	['僕 僕の夢', 'bo ku bo ku bo ku no yu me', '僕(ぼく) 僕(ぼく)の夢(ゆめ)'],
	// 机器音译把「今日は」当成问候语
	['今日はいい天気', 'ko n ni chi ha i i te n ki', '今日(きょう)はいい天気(てんき)'],

	// 夹英文 / 数字：音译里原样留着，转成占位符，和原文的英文对上
	['Hello 世界', 'Hello se ka i', 'Hello 世界(せかい)'],
	['my 夢を見た', 'my yu me wo mi ta', 'my 夢(ゆめ)を見(み)た'],
	['君と3 2 1で', 'ki mi to 3 2 1 de', '君(きみ)と3 2 1で'],
	['Oh 運命の日', 'Oh sa da me no hi', 'Oh 運命(さだめ)の日(ひ)'],
	// 英文里像罗马字的部分（No、to）被转成了假名，占位符两边带着它们
	['Hell No 夢の中', 'Hell no yu me no na ka', 'Hell No 夢(ゆめ)の中(なか)'],
	['Back to 故郷へ', 'Back to fu ru sa to he', 'Back to 故郷(ふるさと)へ'],

	// 和声括号：音译不带括号里那段，跳过它再对
	['夜空に（夜空に）', 'yo zo ra ni', '夜空(よぞら)に（夜空(よぞら)に）'],
	['明日を（歌う）', 'a su wo u ta u', '明日(あす)を（歌(うた)う）'],

	// 作词者自带的注音：括号里的假名直接用，括号藏起来
	['宇宙(そら)を見る', 'so ra wo mi ru', '宇宙(そら)[(そら)]を見(み)る'],
	['宇宙（そら）へ', null, '宇宙(そら)[（そら）]へ'],

	// 只用词典时的读音修正（取自官方音译的统计）
	['失くした鍵', null, '失(な)くした鍵(かぎ)'],
	['何回も回る', null, '何(なん)回(かい)も回(まわ)る'],
	['回レ回レ', null, '回(まわ)レ回(まわ)レ'],
	['君と僕', null, '君(きみ)と僕(ぼく)'],
	['田中君と', null, '田中(たなか)君(くん)と'],
	['風の音', null, '風(かぜ)の音(おと)'],
	['今夜と今', null, '今夜(こんや)と今(いま)'],
	// 数字 + 助数词整体注音 (#6)
	['1人じゃないことも分かってるよ', 'hi to ri ja na i ko to mo wa ka tte ru yo', '1人(ひとり)じゃないことも分(わ)かってるよ'],
	['惹かれあう2人に幸せな音を', 'hi ka re a u fu ta ri ni shi a wa se na o to wo', '惹(ひ)かれあう2人(ふたり)に幸(しあわ)せな音(おと)を'],
	// 音译把数字原样留着：数字对占位符，读音用词典的
	['１人でいるつもりだろう', '1 hi to de i ru tsu mo ri da ro u', '１人(ひとり)でいるつもりだろう'],
	// 机器音译把助数词读成训读，不采用
	['9人の影', 'kyu u hi to no ka ge', '9人(きゅうにん)の影(かげ)'],
	['3人で', null, '3人(さんにん)で'],
	['１人', null, '１人(ひとり)'],
	['三十一人', null, '三十一人(さんじゅういちにん)'],
	['1つだけ', null, '1つ(ひとつ)だけ'],
	['二十日', null, '二十日(はつか)'],
	['二十歳の夏', null, '二十歳(はたち)の夏(なつ)'],
	['4月の雨', null, '4月(しがつ)の雨(あめ)'],
	['6分', null, '6分(ろっぷん)'],
	['3本の花', null, '3本(さんぼん)の花(はな)'],
	['100回', null, '100回(ひゃっかい)'],
	['午前0時', null, '午前(ごぜん)0時(れいじ)'],
	['2万人', null, '2万人(にまんにん)'],
	['十分だ', null, '十分(じゅうぶん)だ'],
	['10年後(じゅうねんご)の8月', null, '10年後(じゅうねんご)[(じゅうねんご)]の8月(はちがつ)'],
];

function render(segs) {
	return segs.map((s) => (s.hidden ? `[${s.text}]` : s.rt ? `${s.text}(${s.rt})` : s.text)).join('');
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
			const kana = romaji == null ? null : core.romajiToKana(romaji);
			const segs = kana
				? core.segmentsFromReading(text, kana, dictSegs, { kana: 'hiragana' })
				: romaji == null
				? dictSegs
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