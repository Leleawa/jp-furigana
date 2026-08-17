// 把 src/ 打包成 builds/jp-furigana.plugin（.plugin 就是个 zip，文件放在 zip 根目录）。
//
//   node tools/pack.js
//   node tools/pack.js --install            复制到 C:\betterncm\plugins
//   node tools/pack.js --install --dir <路径>
//
// 除了 src/ 里的运行时文件，还会带上仓库根目录的 LICENSE / NOTICE.md /
// LICENSE-kuromoji.txt —— 我们分发了 kuromoji 和 IPADIC，许可要求随附声明。
//
// 自己写 zip 而不是调 PowerShell：PS 5.1 读没有 BOM 的 .ps1 会按 ANSI 解，中文注释
// 一乱语法就崩；而且 ZipFile::CreateFromDirectory 会把条目名写成 dict\x（反斜杠，
// 不符合 ZIP 规范，解压端可能不建子目录）。Node 两个坑都没有，CI 里也不必用
// Windows runner。

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'builds');
const OUT = path.join(OUT_DIR, 'jp-furigana.plugin');

// 解包后必须直接躺在插件目录根下（manifest.json 在最外层）
const SRC_FILES = ['manifest.json', 'main.js', 'furigana.js', 'kuromoji.js'];
const SRC_DIRS = ['dict'];
const ROOT_FILES = ['README.md', 'LICENSE', 'NOTICE.md', 'LICENSE-kuromoji.txt'];

// ---------------------------------------------------------------- zip 写入

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c;
	}
	return table;
})();

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

/** ZIP 用的 DOS 时间戳，秒只有 2 秒精度 */
function dosDateTime(date) {
	const year = Math.max(1980, date.getFullYear());
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
		date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
	};
}

/**
 * @param {{name: string, data: Buffer, mtime: Date}[]} entries 条目名必须用正斜杠
 */
function buildZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
		const crc = crc32(entry.data);
		const { time, date } = dosDateTime(entry.mtime);

		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0); // 局部文件头签名
		local.writeUInt16LE(20, 4); // 解压所需版本
		local.writeUInt16LE(0, 6); // 通用标志位
		local.writeUInt16LE(8, 8); // 压缩方法 deflate
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(date, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28); // 扩展字段长度
		name.copy(local, 30);
		locals.push(local, compressed);

		const central = Buffer.alloc(46 + name.length);
		central.writeUInt32LE(0x02014b50, 0); // 中央目录项签名
		central.writeUInt16LE(20, 4); // 创建版本
		central.writeUInt16LE(20, 6); // 解压所需版本
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(8, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(date, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30); // 扩展字段
		central.writeUInt16LE(0, 32); // 注释
		central.writeUInt16LE(0, 34); // 起始磁盘号
		central.writeUInt16LE(0, 36); // 内部属性
		central.writeUInt32LE(0, 38); // 外部属性
		central.writeUInt32LE(offset, 42); // 局部头偏移
		name.copy(central, 46);
		centrals.push(central);

		offset += local.length + compressed.length;
	}

	const centralBuf = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); // 中央目录结束记录
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20); // 注释长度

	return Buffer.concat([...locals, centralBuf, end]);
}

// ---------------------------------------------------------------- 收集条目

function collect() {
	const entries = [];
	const add = (fullPath, name) => {
		if (!fs.existsSync(fullPath)) throw new Error(`缺少 ${path.relative(ROOT, fullPath)}`);
		entries.push({
			name,
			data: fs.readFileSync(fullPath),
			mtime: fs.statSync(fullPath).mtime,
		});
	};

	for (const f of SRC_FILES) add(path.join(SRC, f), f);
	for (const f of ROOT_FILES) add(path.join(ROOT, f), f);
	for (const d of SRC_DIRS) {
		const base = path.join(SRC, d);
		if (!fs.existsSync(base)) throw new Error(`缺少 src/${d}`);
		for (const f of fs.readdirSync(base).sort()) {
			const full = path.join(base, f);
			if (fs.statSync(full).isFile()) add(full, `${d}/${f}`); // 条目名一律正斜杠
		}
	}
	return entries;
}

// ---------------------------------------------------------------- 主流程

function main() {
	const args = process.argv.slice(2);
	const entries = collect();

	// 自检：条目名不能有反斜杠，manifest.json 必须在根层，词典 12 个文件
	const backslash = entries.filter((e) => e.name.includes('\\'));
	if (backslash.length) throw new Error(`条目名里有反斜杠: ${backslash.map((e) => e.name)}`);
	if (!entries.some((e) => e.name === 'manifest.json'))
		throw new Error('manifest.json 不在 zip 根层，BetterNCM 会认不出来');
	const dictCount = entries.filter((e) => e.name.startsWith('dict/')).length;
	if (dictCount !== 12) throw new Error(`dict/ 下应有 12 个词典文件，实际 ${dictCount} 个`);

	fs.mkdirSync(OUT_DIR, { recursive: true });
	fs.writeFileSync(OUT, buildZip(entries));

	const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
	const mb = (fs.statSync(OUT).size / 1048576).toFixed(2);
	console.log(`已打包 v${manifest.version}，${entries.length} 个条目 -> ${OUT} (${mb} MB)`);
	console.log(`自检通过: 条目名全为正斜杠, manifest.json 在根层, dict/ 有 ${dictCount} 个文件`);

	if (args.includes('--install')) {
		const i = args.indexOf('--dir');
		const dir = i >= 0 && args[i + 1] ? args[i + 1] : 'C:\\betterncm\\plugins';
		if (!fs.existsSync(dir)) throw new Error(`找不到插件目录 ${dir}`);
		fs.copyFileSync(OUT, path.join(dir, path.basename(OUT)));
		console.log(`已复制到 ${dir}，重启网易云生效`);
	}
}

main();
