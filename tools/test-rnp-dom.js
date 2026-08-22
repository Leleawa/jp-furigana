// 在 jsdom 里模拟 RefinedNowPlaying 的逐字歌词 DOM，跑一遍插件，看注音有没有加上。
// jsdom 不是插件的依赖，跑之前先装：
//   npm i jsdom
//   node tools/test-rnp-dom.js          # float 动画（RNP 默认）
//   node tools/test-rnp-dom.js slide    # 滑动动画，每个词有一份 filler 副本
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
	({ JSDOM } = require('jsdom'));
} catch (e) {
	console.error('需要 jsdom：npm i jsdom');
	process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2] === 'slide' ? 'slide' : 'float';
// 加 noruby 参数：模拟旧版网易云那种不认 ruby 排版的内核（注音走绝对定位的降级路径）
const NO_RUBY = process.argv.includes('noruby');
// 加 lyricbar 参数：换成 LyricBar 的逐字结构
// （div.lyric-bar-inner … div.rnp-lyrics-line-karaoke > span.rnp-karaoke-word.lyricbar-karaoke-word > span）
const BAR = process.argv.includes('lyricbar');

// 逐字歌词是按词切开的，这里照着 RNP 的结构手搭一份
const LINES = [
	['時', 'に', 'は', '傷', 'つけ', 'あって', 'も'],
	['あなた', 'を', '感じ', 'て', 'い', 'たい'],
	['思い', 'で', 'は', 'せめて', 'もの', '慰め'],
	['いつ', 'まで', 'も', 'あなた', 'は', 'ここ', 'に', 'いる'], // 没汉字，应当不动
	['まだ', '最', '初', 'は'], // yrc 常把汉字一字一切，「最初」的读音跨了两个 span
];
const TRANS = [
	'哪怕有时我们伤害了彼此',
	'我也希望能够感觉到你的存在',
	'即使只有回忆来安慰',
	'无论何时你都在此处',
	'从最初还是',
];
// 离当前行 10 行以外的，RNP 仍然渲染成 -original
const FAR = ['たった一言伝えたい', 'もう一度あなたに会えるなら'];

function buildDom() {
	const lines = LINES.map((words, i) => {
		const w = words
			.map((word) => {
				const filler =
					MODE === 'slide' ? `<span class="rnp-karaoke-word-filler">${word}</span>` : '';
				return `<div class="rnp-karaoke-word" style="display:inline-block"><span>${word}</span>${filler}</div>`;
			})
			.join('');
		return `<div class="rnp-lyrics-line" offset="${i}">
			<div class="rnp-lyrics-line-karaoke">${w}</div>
			<div class="rnp-lyrics-line-translated">${TRANS[i]}</div>
		</div>`;
	}).join('');
	const far = FAR.map(
		(t) => `<div class="rnp-lyrics-line"><div class="rnp-lyrics-line-original">${t}</div></div>`
	).join('');
	// refined-now-playing-netease-next 把网易云原生的播放页留在 DOM 里，只用
	// `#root .g-single { visibility: hidden }` 藏起来，原生歌词列表连文字一起还在。
	const native = LINES.concat([['一言', '伝え', 'たい']])
		.map(
			(words, i) =>
				`<li class="line"><p>${words.join('')}</p><p>${TRANS[i] || '翻译'}</p></li>`
		)
		.join('');
	if (BAR) {
		// LyricBar：词是 span 不是 div，多一个 lyricbar-karaoke-word 类，没有 filler 副本
		const barLines = LINES.map((words) => {
			const w = words
				.map(
					(word) =>
						`<span class="rnp-karaoke-word lyricbar-karaoke-word is-cjk" style="display:inline-block"><span>${word}</span></span>`
				)
				.join('');
			return `<div class="rnp-lyrics-line"><div class="rnp-lyrics-line-karaoke">${w}</div></div>`;
		}).join('');
		return `<body><div class="lyric-bar"><div class="lyric-bar-inner">${barLines}</div></div></body>`;
	}
	return `<body>
		<div id="root">
			<div class="g-single" style="visibility:hidden">
				<ul id="mod_pc_lyric_record" class="lyric">${native}</ul>
			</div>
		</div>
		<div id="rnp-view">
			<div class="lyric"><div class="rnp-lyrics"><div class="rnp-lyrics-inner">${lines}${far}</div></div></div>
		</div>
	</body>`;
}

const dom = new JSDOM(buildDom(), {
	runScripts: 'outside-only',
	pretendToBeVisual: true,
	url: 'https://music.163.com/', // localStorage 在 about:blank 下会抛 SecurityError
});
const win = dom.window;

let recalcCount = 0;
win.addEventListener('recalc-lyrics', () => recalcCount++);

// ------------------------------------------------------------------ BetterNCM 打桩
const handlers = {};
win.plugin = {
	pluginPath: path.join(ROOT, 'src'),
	devMode: false,
	onLoad: (fn) => (handlers.load = fn),
	onConfig: (fn) => (handlers.config = fn),
};
win.betterncm = {
	app: { getBetterNCMVersion: async () => '1.3.0' },
	ncm: { openUrl: () => {} },
	fs: {
		exists: async (p) => fs.existsSync(p),
		readFile: async (p) => {
			const b = fs.readFileSync(p);
			// node 的 ArrayBuffer 过不了 jsdom realm 里的 instanceof，走 arrayBuffer() 这条分支
			return {
				arrayBuffer: async () => {
					const ab = new win.ArrayBuffer(b.length);
					new win.Uint8Array(ab).set(b);
					return ab;
				},
			};
		},
	},
};
// 只用词典，不联网取音译
win.localStorage.setItem('jp-furigana.config', JSON.stringify({ readingSource: 'dict' }));
if (NO_RUBY) win.localStorage.setItem('jp-furigana.no-ruby', '1');

const load = (f) => win.eval(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'));
load('kuromoji.js');
load('furigana.js');
load('main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
/** 注音块的底字（原生 ruby 和降级 span 两种结构都适用） */
const baseText = (holder) => {
	const c = holder.cloneNode(true);
	c.querySelectorAll('.fg-rt').forEach((e) => e.remove());
	return c.textContent;
};
function check(ok, label, detail) {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail == null ? '' : '  ' + detail}`);
	if (!ok) failed++;
}

(async () => {
	await handlers.load();
	for (let i = 0; i < 120 && !win.JPFurigana.state.tokenizer; i++) await sleep(250);
	if (!win.JPFurigana.state.tokenizer)
		throw new Error('词典没加载起来: ' + win.JPFurigana.state.loadError);

	win.JPFurigana.pass();
	await sleep(800);

	const st = win.JPFurigana.state;
	console.log(
		`
=== ${BAR ? 'LyricBar' : 'RNP'} 逐字歌词（${MODE} 动画${NO_RUBY ? '，内核不认 ruby' : ''}）===`
	);
	console.log('matchedBy =', st.matchedBy);

	const karaoke = [...win.document.querySelectorAll('.rnp-lyrics-line-karaoke')];
	if (BAR) {
		// issue #1：逐字打开时能不能命中
		check(/karaoke/.test(st.matchedBy || ''), '命中 LyricBar 的逐字行', st.matchedBy);
		check(st.lineCount === LINES.length, '每一行都收进来了', `lines=${st.lineCount}`);
	} else {
		check(
			/rnp-lyrics-line-karaoke/.test(st.matchedBy || ''),
			'选中的是看得见的那份歌词，不是被藏起来的原生播放页'
		);
		check(
			win.document.querySelectorAll('#root .lyric .fg-rt').length === 0,
			'藏起来的原生歌词没被注音'
		);
		check(
			st.lineCount === LINES.length + FAR.length,
			'逐字行和远处的原文行都被收进来了',
			`lines=${st.lineCount}`
		);
	}

	const perWord = (el) => {
		const spans = [...el.querySelectorAll('.rnp-karaoke-word > span')];
		return spans.length && spans.every((s) => s.querySelector('.fg-line'));
	};
	for (let i = 0; i < 3; i++) {
		const rt = [...karaoke[i].querySelectorAll('.fg-rt')].map((r) => r.textContent);
		check(rt.length > 0, `第 ${i + 1} 行注上了音`, `rt=[${rt.join(' ')}]`);
		check(perWord(karaoke[i]), `第 ${i + 1} 行注音分发到了每个词（逐字动画不受影响）`);
	}
	check(
		karaoke[3].querySelectorAll('.fg-rt').length === 0,
		'没汉字的行没被动过'
	);

	// 「最」「初」是两个独立的 inline-block，注音只挂在头一个上的话，
	// 那个盒子会被撑宽，字被挤开、注音看着就偏了 —— 应当合成一组
	const split = karaoke[4];
	const holder = split.querySelector('.fg-ruby');
	check(
		holder && baseText(holder) === '最初',
		'跨 span 的词被合起来注音（底字是整个词）',
		holder && baseText(holder)
	);
	check(
		holder && holder.querySelector('.fg-rt').textContent === 'さいしょ',
		'合并后的读音是整词的读音'
	);
	const splitWords = [...split.querySelectorAll('.rnp-karaoke-word')];
	check(splitWords.length === 4, '被合并的 span 本身还在（逐字动画的目标不变）', `${splitWords.length} 个`);
	check(
		splitWords[2].textContent === '',
		'并进去的那个 span 被清空了，不会重复出现'
	);
	const splitBody = split.cloneNode(true);
	// rt 是我们加的，filler 是 slide 动画本来就有的重复副本，都不算原文
	splitBody.querySelectorAll('.fg-rt, .rnp-karaoke-word-filler').forEach((el) => el.remove());
	check(splitBody.textContent === 'まだ最初は', '整行原文没多也没少', splitBody.textContent);
	check(
		[...win.document.querySelectorAll('.rnp-lyrics-line-original')].every(
			(el) => el.querySelectorAll('.fg-rt').length > 0
		),
		'远处还没换成逐字的行也注上了音'
	);
	check(
		win.document.querySelectorAll('.rnp-lyrics-line-translated rt').length === 0,
		'翻译行没被注音'
	);
	if (MODE === 'slide') {
		const w = karaoke[0].querySelector('.rnp-karaoke-word');
		check(
			w.querySelector('.rnp-karaoke-word-filler .fg-line') != null,
			'filler 副本跟着一起注音（滑动高亮才对得上）'
		);
		check(
			karaoke[0].querySelector('.rnp-karaoke-word > span').textContent ===
				w.querySelector('.rnp-karaoke-word-filler').textContent,
			'本体和副本内容一致'
		);
	}
	check(recalcCount === 1, '给 RNP 发了 recalc-lyrics 让它重量行高', `count=${recalcCount}`);

	if (NO_RUBY) {
		check(
			win.document.querySelectorAll('ruby').length === 0 &&
				win.document.querySelectorAll('.fg-rt').length > 0,
			'降级模式下不用 ruby/rt，注音是普通 span'
		);
		const body = karaoke[0].cloneNode(true);
		body.querySelectorAll('.fg-rt, .rnp-karaoke-word-filler').forEach((el) => el.remove());
		check(body.textContent === '時には傷つけあっても', '降级模式下注音没混进原文', body.textContent);
	}

	// 逐字的每个词是独立 inline-block，注音只会从盒子上边溢出去、撑不高它，
	// RNP 按 clientHeight 排行距就会让注音压到上一行 —— 靠 .fg-word 把高度让出来
	check(
		[...karaoke[0].querySelectorAll('.fg-line')].every((el) => el.classList.contains('fg-word')),
		'逐字宿主上的 wrap 带 fg-word（会撑出注音的高度）'
	);
	check(
		[...win.document.querySelectorAll('.rnp-lyrics-line-original .fg-line')].every(
			(el) => !el.classList.contains('fg-word')
		),
		'整行改写的普通行不带 fg-word（保持 display:inline，能正常折行）'
	);
	const css = win.document.getElementById('jp-furigana-style').textContent;
	check(
		/\.fg-line\.fg-word\s*\{[^}]*inline-block[^}]*padding-top:\s*var\(--fg-word-offset/.test(css),
		'逐字宿主的让位量走 --fg-word-offset（量出来的，不是写死的），且加在每个词上'
	);
	check(
		/\.fg-line,\s*\.fg-ruby\s*\{[^}]*opacity:\s*1\s*!important/.test(css),
		'包装 span 不再叠一层透明度（RNP 的 opacity 会逐层相乘）'
	);
	if (NO_RUBY) {
		check(
			/\.fg-ruby\s*>\s*\.fg-rt\s*\{[^}]*position:\s*absolute/.test(css),
			'降级模式下注音绝对定位'
		);
		check(
			!/\.fg-ruby\s*\{[^}]*inline-block/.test(css),
			'降级模式下 .fg-ruby 保持 inline（不然带注音的字会被压低）'
		);
	}
	check(
		[...win.document.querySelectorAll('.fg-rt')].every(
			(r) => r.closest('.fg-ruby')
		),
		'每个注音都套了一层 .fg-ruby（整行改写那条路上也能调让位）'
	);

	// 空转：行没变就不该再动 DOM
	const before = recalcCount;
	for (let i = 0; i < 3; i++) {
		win.JPFurigana.pass();
		await sleep(250);
	}
	check(recalcCount === before, '空转几轮不会反复发 recalc');

	if (!BAR) {
		// RNP 滚动时会把远处的 -original 换成逐字行
		const farLine = win.document.querySelector('.rnp-lyrics-line-original').parentElement;
		farLine.innerHTML =
			'<div class="rnp-lyrics-line-karaoke">' +
			['たった', '一言', '伝え', 'たい']
				.map(
					(w) =>
						`<div class="rnp-karaoke-word" style="display:inline-block"><span>${w}</span></div>`
				)
				.join('') +
			'</div>';
		await sleep(600);
		const swapped = farLine.querySelector('.rnp-lyrics-line-karaoke');
		check(swapped.querySelectorAll('.fg-rt').length > 0, '原文行换成逐字行后会重新注音', swapped.textContent);

		// 反过来：RNP 那份藏起来、原生页露出来时，应该回去注原生的
		win.document.getElementById('rnp-view').style.visibility = 'hidden';
		win.document.querySelector('#root .g-single').style.visibility = 'visible';
		win.JPFurigana.pass();
		await sleep(600);
		check(
			/ul\.lyric/.test(win.JPFurigana.state.matchedBy || ''),
			'原生播放页露出来时会切回去注它',
			win.JPFurigana.state.matchedBy
		);
		check(win.document.querySelectorAll('#root .lyric .fg-rt').length > 0, '原生歌词注上了音');
		win.document.getElementById('rnp-view').style.visibility = '';
		win.document.querySelector('#root .g-single').style.visibility = 'hidden';
		win.JPFurigana.pass();
		await sleep(600);

		// 诊断接口别在真机上炸（jsdom 没有排版，只验能跑通）
		const dump = win.JPFurigana.dumpLine();
		check(
			dump && dump.build && Array.isArray(dump.逐字切法) && Array.isArray(dump.注音),
			'dumpLine 能输出逐字切法和注音测量',
			dump && `build=${dump.build} 切法=${JSON.stringify(dump.逐字切法)}`
		);
	}

	// 关掉之后要还原干净
	win.JPFurigana.disable();
	await sleep(300);
	check(win.document.querySelectorAll('ruby').length === 0, '关掉后 DOM 还原干净');
	// slide 下每个词本来就有两份文本（filler 副本），只数本体
	const body = [
		...win.document
			.querySelector('.rnp-lyrics-line-karaoke')
			.querySelectorAll('.rnp-karaoke-word > span:not(.rnp-karaoke-word-filler)'),
	]
		.map((s) => s.textContent)
		.join('');
	check(body === '時には傷つけあっても', '还原后文本没重复也没缺', body);

	console.log(failed ? `\n${failed} 项没过` : '\n全部通过');
	process.exit(failed ? 1 : 0);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
