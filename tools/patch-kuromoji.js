// 把 npm 上的 kuromoji 浏览器构建改造成适合 BetterNCM 插件环境的版本。
// 用法: node tools/patch-kuromoji.js <kuromoji.js 源文件> <输出文件>
//
// 改了三处：
//   1. UMD 头部：网易云页面里存在 AMD 的 define，原始头部会把模块注册给 define
//      而不是挂到 window 上，这里强制挂到 window.kuromoji。
//   2. path.join：browserify 的 path.join 会把 "http://a" 规范化成 "http:/a"，
//      词典 URL 一律用简单拼接。
//   3. loadArrayBuffer：允许外部通过 window.__FURIGANA_DICT_LOADER__ 提供
//      读取器，这样可以走 betterncm.fs 读本地文件，不依赖 HTTP 端口。

const fs = require('fs');

const [, , src, out] = process.argv;
if (!src || !out) {
	console.error('usage: node patch-kuromoji.js <src> <out>');
	process.exit(1);
}

let code = fs.readFileSync(src, 'utf8');
const before = code;

// --- 1. UMD 头部 ---
const umdHead =
	'(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.kuromoji = f()}})(';
if (!code.startsWith(umdHead)) throw new Error('UMD header not found — kuromoji version changed?');
code =
	'(function(f){var m=f();var g=(typeof window!=="undefined")?window:(typeof globalThis!=="undefined"?globalThis:this);g.kuromoji=m;if(typeof module==="object"&&module&&module.exports)module.exports=m;})(' +
	code.slice(umdHead.length);

// --- 2. 词典路径拼接 ---
const anchor = 'var define,module,exports;';
if (!code.includes(anchor)) throw new Error('browserify prelude anchor not found');
code = code.replace(
	anchor,
	anchor +
		'function __fgJoin(a,b){return String(a).replace(/\\/+$/,"")+"/"+b;}'
);
const joinCount = (code.match(/path\.join\(dic_path, /g) || []).length;
if (joinCount === 0) throw new Error('no path.join(dic_path, ...) call found');
code = code.replace(/path\.join\(dic_path, /g, '__fgJoin(dic_path, ');

// --- 3. 可替换的读取器 ---
const loaderHead =
	'BrowserDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {\n    var xhr = new XMLHttpRequest();';
if (!code.includes(loaderHead)) throw new Error('loadArrayBuffer not found');
code = code.replace(
	loaderHead,
	'BrowserDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {\n' +
		'    var custom = (typeof globalThis !== "undefined") && globalThis.__FURIGANA_DICT_LOADER__;\n' +
		'    if (custom) {\n' +
		'        Promise.resolve(custom(url)).then(function (ab) {\n' +
		'            try {\n' +
		'                var g = new zlib.Zlib.Gunzip(new Uint8Array(ab));\n' +
		'                callback(null, g.decompress().buffer);\n' +
		'            } catch (e) { callback(e, null); }\n' +
		'        }, function (e) { callback(e, null); });\n' +
		'        return;\n' +
		'    }\n' +
		'    var xhr = new XMLHttpRequest();'
);

if (code === before) throw new Error('nothing was patched');

// Apache-2.0 §4(b)：改过的文件要带醒目的修改说明
const banner = `/*
 * kuromoji.js 0.1.2 — Copyright (c) 2014-2018 Takuya Asano and contributors
 * Licensed under the Apache License, Version 2.0 (see LICENSE-kuromoji.txt).
 *
 * NOTICE: This file has been MODIFIED from the upstream release by the
 * jp-furigana BetterNCM plugin. Changes (see tools/patch-kuromoji.js):
 *   1. UMD header always assigns to window.kuromoji.
 *   2. Dictionary paths are joined by plain concatenation instead of path.join.
 *   3. Added a globalThis.__FURIGANA_DICT_LOADER__ hook to loadArrayBuffer.
 * See also NOTICE.md for the bundled IPADIC dictionary license.
 */
`;
code = banner + code;

fs.mkdirSync(require('path').dirname(out), { recursive: true });
fs.writeFileSync(out, code);
console.log(
	`patched: ${joinCount} path.join call(s), UMD header, dict loader hook -> ${out} (${code.length} bytes)`
);
