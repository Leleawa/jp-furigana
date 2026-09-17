// 从网易云抓歌词接口响应存进 tools/fixtures/（已 gitignore，不进仓库），给 test-lyrics-batch.js 用
//   node tools/fetch-lyrics.js "夜に駆ける YOASOBI" "Lemon 米津玄師"   按关键词，各取第一首带音译的
//   node tools/fetch-lyrics.js --playlist 2137987910                  整个歌单
//   可选 --delay <毫秒>，两次请求之间的间隔，默认 1500（非官方接口，别抓太快）
// 已经抓过的、确认没有音译的会跳过，中断后重跑接着抓。
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fixtures');
const SKIP_FILE = path.join(OUT, 'no-romaji.json'); // 没有音译的歌，不用再请求

const args = process.argv.slice(2);
const opt = (name) => {
	const i = args.indexOf(name);
	if (i < 0) return null;
	const v = args[i + 1];
	args.splice(i, 2);
	return v;
};
const delay = Number(opt('--delay') || 1500);
const playlist = opt('--playlist');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url) {
	// 限速：两次请求至少隔 delay，再加一点抖动
	const wait = last + delay + Math.random() * delay * 0.3 - Date.now();
	if (wait > 0) await sleep(wait);
	for (let attempt = 1; ; attempt++) {
		last = Date.now();
		try {
			const r = await fetch(url, { headers: { Referer: 'https://music.163.com/' } });
			const data = await r.json();
			// -460 / 405 是反爬，继续请求只会更糟
			if (data.code === -460 || data.code === 405) throw Object.assign(new Error(`被限流 (code ${data.code})`), { fatal: true });
			return data;
		} catch (e) {
			if (e.fatal || attempt >= 3) throw e;
			await sleep(delay * 4 * attempt);
		}
	}
}

const hasRomaji = (d) => d && d.lrc && d.lrc.lyric && d.romalrc && d.romalrc.lyric;
const fixture = (id) => path.join(OUT, `lyric-${id}.json`);

async function bySearch(q) {
	const res = await get(`https://music.163.com/api/search/get?type=1&limit=10&s=${encodeURIComponent(q)}`);
	for (const s of (res.result && res.result.songs) || []) {
		const data = await get(`https://music.163.com/api/song/lyric?lv=-1&kv=-1&tv=-1&rv=-1&id=${s.id}`);
		if (!hasRomaji(data)) continue;
		fs.writeFileSync(fixture(s.id), JSON.stringify(data));
		console.log(`OK   ${q} -> ${s.id} ${s.name} / ${s.artists.map((a) => a.name).join(',')}`);
		return;
	}
	console.log(`MISS ${q}（前 10 条都没有音译）`);
}

async function byPlaylist(id) {
	const res = await get(`https://music.163.com/api/v6/playlist/detail?id=${id}&n=0`);
	if (!res.playlist) throw new Error(`拿不到歌单 ${id}（code ${res.code}）`);
	const ids = res.playlist.trackIds.map((t) => t.id);
	console.log(`歌单「${res.playlist.name}」共 ${ids.length} 首，间隔 ${delay}ms`);

	const skip = new Set(fs.existsSync(SKIP_FILE) ? JSON.parse(fs.readFileSync(SKIP_FILE, 'utf8')) : []);
	const todo = ids.filter((x) => !skip.has(x) && !fs.existsSync(fixture(x)));
	console.log(`已有 ${ids.length - todo.length} 首，待抓 ${todo.length} 首`);

	let ok = 0;
	let none = 0;
	for (const [i, sid] of todo.entries()) {
		const data = await get(`https://music.163.com/api/song/lyric?lv=-1&kv=-1&tv=-1&rv=-1&id=${sid}`);
		if (hasRomaji(data)) {
			fs.writeFileSync(fixture(sid), JSON.stringify(data));
			ok++;
		} else {
			skip.add(sid);
			none++;
			fs.writeFileSync(SKIP_FILE, JSON.stringify([...skip]));
		}
		if ((i + 1) % 50 === 0 || i + 1 === todo.length)
			console.log(`[${i + 1}/${todo.length}] 有音译 ${ok}，无音译 ${none}`);
	}
}

(async () => {
	fs.mkdirSync(OUT, { recursive: true });
	if (playlist) await byPlaylist(playlist);
	for (const q of args) await bySearch(q);
})().catch((e) => {
	console.error('中止: ' + e.message);
	process.exit(1);
});
