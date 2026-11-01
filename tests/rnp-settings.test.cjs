'use strict';
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { install } = require('../src/rnp-settings.js');
// Minimal structural fixture, not the third-party bundle or its implementation.
const markup = '<div class="rnp-settings-menu"><div class="rnp-settings-menu-tabs">' + ['appearance', 'lyric', 'font'].map(tab => '<div class="rnp-settings-menu-tab" data-tab="' + tab + '">' + tab + '</div>').join('') +
	'</div><div class="rnp-settings-menu-inner">' + ['appearance', 'lyric', 'font'].map(tab => '<div class="rnp-group" data-tab="' + tab + '"></div>').join('') + '</div></div>';
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
const doc = dom.window.document, listeners = new Set();
const config = { enabled: true, readingSource: 'external', externalProvider: 'auto', externalAutoRetry: 'failed', rtSize: 60, rtOpacity: 80, karaoke: true, onlyFirstLine: true, skipCredits: true, skipNoKanaLines: true };
let retries = 0, opens = 0,assignments=0;
const api = { config: () => config, status: () => ({ text: '测试状态', canRetry: config.enabled, canOpen: true,canAssign:config.enabled&&config.externalProvider!=='utanet' }), subscribe: f => { listeners.add(f); return () => listeners.delete(f); },
	set: (key, value) => { config[key] = value; for (const f of listeners) f(); }, retry: () => retries++, openSource: () => opens++,assignSource:()=>assignments++ };
const adapter = install(api, doc), tick = () => new Promise(resolve => setTimeout(resolve, 30));
(async () => {
	assert.equal(listeners.size, 0, 'RNP is optional');
	doc.body.innerHTML = markup; await tick();
	assert.equal(listeners.size, 1);
	const menu = doc.querySelector('.rnp-settings-menu'), inner = menu.querySelector('.rnp-settings-menu-inner');
	assert.deepEqual([...menu.querySelector('.rnp-settings-menu-tabs').children].map(n => n.dataset.tab), ['appearance', 'lyric', 'jp-furigana', 'font']);
	assert.deepEqual([...inner.children].map(n => n.dataset.tab), ['appearance', 'lyric', 'jp-furigana', 'font']);
	const group = inner.querySelector('[data-tab="jp-furigana"]');
	assert.equal(group.querySelectorAll('[data-key]').length, 7); // Web furigana controls only.
	assert.equal(group.querySelectorAll('[data-choice]').length, 3);
	assert(!group.querySelector('[data-key^="desktop"],[data-desktop-options]'));
	const enabled = group.querySelector('[data-key="enabled"]'); enabled.checked = false; enabled.dispatchEvent(new dom.window.Event('change'));
	assert.equal(config.enabled, false); assert(group.querySelector('[data-action="retry"]').disabled);
	api.set('enabled', true); assert(enabled.checked);
	group.querySelector('[data-choice="readingSource"] [data-value="dict"]').click(); assert(group.querySelector('[data-external]').hidden);
	api.set('readingSource', 'external'); assert(!group.querySelector('[data-external]').hidden);
	group.querySelector('[data-choice="externalAutoRetry"] [data-value="off"]').click(); assert.equal(config.externalAutoRetry, 'off');
	group.querySelector('[data-choice="externalProvider"] [data-value="utaten"]').click(); assert.equal(config.externalProvider, 'utaten');
	const slider = group.querySelector('[data-key="rtSize"]'); slider.value = '75'; slider.dispatchEvent(new dom.window.Event('input'));
	assert.equal(config.rtSize, 60, 'Dragging previews without saving configuration'); assert.equal(group.querySelector('[data-value-for="rtSize"]').textContent, '75%');
	for (const listener of listeners) listener(); assert.equal(slider.value, '75', 'Status refresh preserves the pending slider value');
	slider.dispatchEvent(new dom.window.Event('change')); assert.equal(config.rtSize, 75);
	group.querySelector('[data-reset="rtSize"]').click(); assert.equal(config.rtSize, 60);
	for (const key of ['karaoke', 'onlyFirstLine', 'skipCredits', 'skipNoKanaLines']) { const input = group.querySelector('[data-key="' + key + '"]'); input.checked = false; input.dispatchEvent(new dom.window.Event('change')); assert.equal(config[key], false); }
	group.querySelector('[data-action="retry"]').click(); group.querySelector('[data-action="source"]').click(); assert.equal(retries, 1); assert.equal(opens, 1);
	group.querySelector('[data-action="assign"]').click();assert.equal(assignments,1);api.set('externalProvider','utanet');assert(group.querySelector('[data-action="assign"]').disabled);api.set('externalProvider','utaten');assert(!group.querySelector('[data-action="assign"]').disabled);
	[...inner.children].forEach((n, i) => Object.defineProperty(n, 'offsetTop', { value: i * 200 }));
	inner.scrollTo = options => { inner.scrollTop = options.top; inner.dispatchEvent(new dom.window.Event('scroll')); };
	// Simulate a stale native scroll handler registered before/after extension initialization.
	inner.addEventListener('scroll', () => { menu.querySelector('[data-tab="lyric"]').classList.add('active'); });
	menu.querySelector('.rnp-settings-menu-tab[data-tab="jp-furigana"]').click(); await tick();
	assert.equal(inner.scrollTop, 405); assert.equal(menu.querySelector('.rnp-settings-menu-tab.active').dataset.tab, 'jp-furigana');
	inner.scrollTop = 392; inner.dispatchEvent(new dom.window.Event('scroll')); await tick();
	assert.equal(menu.querySelector('.rnp-settings-menu-tab.active').dataset.tab, 'jp-furigana', 'Visible heading keeps its highlight after a small layout shift');
	inner.scrollTop = 605; inner.dispatchEvent(new dom.window.Event('scroll')); await tick();
	assert.equal(menu.querySelector('.rnp-settings-menu-tab.active').dataset.tab, 'font');
	adapter.scan(); adapter.scan(); assert.equal(listeners.size, 1); assert.equal(inner.querySelectorAll('[data-tab="jp-furigana"]').length, 1);
	doc.body.innerHTML = markup; await tick(); assert.equal(listeners.size, 1, 'Rebuilt menus release previous subscriptions');
	assert(doc.querySelector('[data-key="enabled"]').checked);
	doc.body.innerHTML = '<div class="rnp-settings-menu">Unsupported future structure</div>'; await tick(); assert.equal(listeners.size, 0);
	adapter.destroy(); assert.equal(doc.head.querySelectorAll('style').length, 0);
	console.log('RNP settings passed: optional/delayed load, placement, all controls, synchronization, navigation, duplicate prevention, rebuild and cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { adapter.destroy(); dom.window.close(); });
