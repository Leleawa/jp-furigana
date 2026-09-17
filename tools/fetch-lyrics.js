// 按关键词在网易云搜歌，把歌词接口响应存进 tools/fixtures/（已 gitignore，不进仓库）
//   node tools/fetch-lyrics.js "夜に駆ける YOASOBI" "Lemon 米津玄師"
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fixtures');
const get = (url) => fetch(url, { headers: { Referer: 'https://music.163.com/' } }).then((r) => r.json());

(async () => {
	fs.mkdirSync(OUT, { recursive: true });
	for (const q of process.argv.slice(2)) {
		const res = await get(`https://music.163.com/api/search/get?type=1&limit=10&s=${encodeURIComponent(q)}`);
		const songs = (res.result && res.result.songs) || [];
		let saved = false;
		for (const s of songs) {
			const data = await get(`https://music.163.com/api/song/lyric?lv=-1&kv=-1&tv=-1&rv=-1&id=${s.id}`);
			if (!data.lrc || !data.lrc.lyric || !data.romalrc || !data.romalrc.lyric) continue;
			fs.writeFileSync(path.join(OUT, `lyric-${s.id}.json`), JSON.stringify(data));
			console.log(`OK   ${q} -> ${s.id} ${s.name} / ${s.artists.map((a) => a.name).join(',')}`);
			saved = true;
			break;
		}
		if (!saved) console.log(`MISS ${q}（前 10 条都没有音译）`);
	}
})();
