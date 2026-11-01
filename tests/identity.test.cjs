'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const src = path.resolve(__dirname, '../src'), manifest = require('../src/manifest.json');
async function fixture(existing, desktopChoice) {
	const dom = new JSDOM('<body><p id="original">原页面</p></body>', { url:'https://music.163.com/',runScripts:'outside-only',pretendToBeVisual:true });
	const win=dom.window, handlers={}, opened=[];
	const plusSettings=JSON.stringify({ enabled:false,readingSource:'dict',rtSize:74,configVersion:2,externalProxyEnabled:true,externalProxy:'http://127.0.0.1:9',...(desktopChoice===undefined?{}:{desktopEnabled:desktopChoice}) });
	const upstreamSettings=JSON.stringify({enabled:false,readingSource:'romaji',rtSize:66,configVersion:3,desktopEnabled:false});
	const plusCore={},plusDictionary={},plusLoader=()=>{};
	win.FuriganaPlusCore=plusCore;win.kuromojiFuriganaPlus=plusDictionary;win.__FURIGANA_PLUS_DICT_LOADER__=plusLoader;
	win.loadedPlugins={'jp-furigana':{manifest}};
	win.plugin={pluginPath:src,devMode:false,onLoad:f=>handlers.load=f,onAllPluginsLoaded:f=>handlers.all=f,onConfig:f=>handlers.config=f};
	win.betterncm={app:{getBetterNCMVersion:async()=>'1.3.4'},ncm:{openUrl:url=>opened.push(url)}};
	win.localStorage.setItem('jp-furigana-plus.config',plusSettings);
	win.localStorage.setItem('jp-furigana-plus.cache.v4','keep-plus-cache');
	if(existing)win.localStorage.setItem('jp-furigana.config',upstreamSettings);
	for(const {file} of manifest.injects.Main)win.eval(fs.readFileSync(path.join(src,file),'utf8'));
	assert.equal(handlers.load,undefined,'Wait until all manifests are known so Plus can detect the original');
	assert(!win.JPFurigana);await handlers.all(win.loadedPlugins);
	assert(win.JPFurigana,'Original slug must not detect itself as a conflict');assert(!win.JPFuriganaPlus);
	assert.equal(win.FuriganaPlusCore,plusCore);assert.equal(win.kuromojiFuriganaPlus,plusDictionary);assert.equal(win.__FURIGANA_PLUS_DICT_LOADER__,plusLoader);
	assert.equal(win.JPFurigana.config.rtSize,existing?66:74,'Existing upstream preferences take priority; copy Plus only when absent');
	assert(!Object.keys(win.JPFurigana.config).some(key=>key.startsWith('desktop')),'Legacy Plus-only desktop preferences are removed from upstream configuration');
	assert.equal(win.JPFurigana.config.configVersion,4);
	assert(!('externalProxy' in win.JPFurigana.config));assert(!('externalProxyEnabled' in win.JPFurigana.config));
	win.JPFurigana.set('rtSize',81);assert.equal(JSON.parse(win.localStorage.getItem('jp-furigana.config')).rtSize,81);
	assert.equal(win.localStorage.getItem('jp-furigana-plus.config'),plusSettings);assert.equal(win.localStorage.getItem('jp-furigana-plus.cache.v4'),'keep-plus-cache');
	const panel=handlers.config();panel.querySelector('[data-open]').click();assert.equal(opened[0],'https://github.com/Leleawa/jp-furigana');
	assert.equal(win.document.querySelector('#original').textContent,'原页面');win.close();
}
(async()=>{
	await fixture(false);await fixture(false,false);await fixture(false,true);await fixture(true);
	console.log('Identity passed: original API and slug, upstream settings priority, optional Plus migration, unchanged Plus storage and upstream links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
