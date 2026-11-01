// Distribution checks shared by local development and CI. No network or writes.
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), src = path.join(root, 'src');
const m = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(lock.version,pkg.version,'Lockfile version must match package.json');assert.equal(lock.packages[''].version,pkg.version,'Lockfile root metadata must match package.json');
for (const key of ['name','slug','version','author','author_link','description','preview','betterncm_version']) assert(m[key], 'Missing ' + key);
assert.equal(m.slug, 'jp-furigana'); assert(!m.fork_of); assert.equal(m.version, pkg.version);
assert.equal(m.author,'leleawa');assert.equal(m.author_link,'https://github.com/Leleawa/jp-furigana');
assert.deepEqual(m.requirements, [], 'RNP remains an optional adapter');
assert.equal(m.require_restart, true); assert(!m.native_plugin, 'No in-process native DLL');
for (const name of ['src/desktop.js','src/desktop-host.exe','native/DesktopLyricsHost.cs','tools/build-desktop-host.ps1','tools/native-build-info.cjs','native-build-info.json']) assert(!fs.existsSync(path.join(root,name)), 'Desktop feature must remain outside upstream: '+name);
assert(!m.injects.Main.some(item=>/desktop/.test(item.file)));
assert(/^[a-zA-Z0-9_-]+$/.test(m.slug)); assert(/^\d+\.\d+\.\d+$/.test(m.version));
assert(!['force-install','force-update','force-uninstall'].some(k => m[k]), 'No forced market actions');
const image = fs.statSync(path.join(src, m.preview)); assert(image.size <= 200 * 1024, 'Preview must stay small');
for (const n of ['LICENSE','NOTICE.md','LICENSE-kuromoji.txt']) assert(fs.readFileSync(path.join(root,n)).equals(fs.readFileSync(path.join(src,n))), 'License drift: ' + n);
for (const item of m.injects.Main) assert(fs.statSync(path.join(src,item.file)).isFile(), 'Missing injected file');
for (const p of ['README.md','docs/external-lyrics.md','docs/distribution.md']) {
	const text = fs.readFileSync(path.join(root,p),'utf8');
	for (const link of text.matchAll(/\]\(([^)]+)\)/g)) if (!/^https?:|^#/.test(link[1])) assert(fs.existsSync(path.resolve(root,path.dirname(p),link[1].split('#')[0])), 'Broken link: ' + link[1]);
}
const main = fs.readFileSync(path.join(src,'main.js'),'utf8');
for (const name of fs.readdirSync(src)) {
	assert(!/\.(ps1|exe|dll)$/i.test(name), 'No shell or native runtime component: '+name);
	if (/\.js$/i.test(name) && name !== 'kuromoji.js') {
		const code=fs.readFileSync(path.join(src,name),'utf8');
		assert(!/app\s*\.\s*exec\s*\(|EncodedCommand|powershell|curl\.exe|child_process/i.test(code), 'No process launch chain: '+name);
	}
}
assert(main.includes('betterncm.ncm.openUrl')); assert(main.includes('反馈问题')); assert(main.includes('源码仓库'));
assert(main.includes("const REPO_URL = 'https://github.com/Leleawa/jp-furigana'"));
assert(main.includes('window.JPFurigana ='));assert(!main.includes('tree/standalone'));
console.log('Store checks passed: upstream identity, optional adapters, version, restart, small preview, license copies, no desktop/process components, support links and documentation.');
