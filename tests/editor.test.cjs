'use strict';
const assert = require('node:assert/strict'), { JSDOM } = require('jsdom'), { install } = require('../src/editor.js');
const dom = new JSDOM('<body><div class="fg-ruby" data-fg-editable>空<span class="fg-rt">そら</span></div></body>', { pretendToBeVisual: true });
const win = dom.window, doc = win.document, holder = doc.querySelector('.fg-ruby');
holder.__fgEdit = { songId: '1', provider: 'local', url: '', line: '空をみる', start: 0, text: '空', original: 'そら', reading: 'そら' };
let id = '1', saves = [], fail = false, confirm = false, changes = 0, deletes = 0, plays = 0;
win.confirm = () => confirm;
const row = { songId: '1', title: '<img src=x onerror=alert(1)>', artists: ['試験歌手'], bytes: 2100, edits: 1, path: 'C:/Test/1.json' };
const editor = install({ songId: () => id, changed: () => changes++,
 save: async (anchor, value) => { if (fail) throw new Error('disk full'); saves.push([anchor.songId, value]); },
 list: async () => ({ dir: 'C:/Test', rows: [row] }),
 manage: async (entry, action) => { if (action === 'delete') deletes++; return { title: entry.title, lines: [{ text: '空をみる' }], userEdits: [] }; },
 play: async () => { plays++; }
}, doc);
const tick = () => new Promise(r => setTimeout(r, 5));
const click = () => holder.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
(async () => {
 click(); assert(!doc.querySelector('.fg-editor-pop'));
 editor.setEnabled(true); click();
 let input = doc.querySelector('[data-reading]'); assert.equal(doc.activeElement, input); assert.equal(doc.querySelector('[data-original]').value, 'そら');
 input.value = 'うみ'; input.dispatchEvent(new win.Event('input'));
 input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); await tick(); assert.equal(saves.length, 0);
 assert.equal(editor.setEnabled(false), false, 'Unsaved input blocks exit when discard is declined');
 assert(doc.querySelector('.fg-editor-pop')); assert(doc.body.classList.contains('fg-edit-mode'));
 input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick();
 assert.deepEqual(saves, [['1', 'うみ']]); assert(!doc.querySelector('.fg-editor-pop'));
 click(); input = doc.querySelector('[data-reading]'); input.value = 'ほし'; input.dispatchEvent(new win.Event('input')); fail = true;
 doc.querySelector('[data-apply]').click(); await tick(); assert.equal(input.value, 'ほし'); assert(doc.querySelector('[role=alert]').textContent.includes('disk full'));
 id = '2'; editor.sync(); assert.equal(input.value, 'ほし'); assert(doc.querySelector('.fg-editor-pop [role=alert]').textContent.includes('歌曲已切换'));
 confirm = true; doc.querySelector('[data-cancel]').click(); assert(!doc.querySelector('.fg-editor-pop')); id = '1'; fail = false;
 click(); doc.querySelector('[data-restore]').click(); await tick(); assert.deepEqual(saves[1], ['1', null]);
 editor.openManager(); await tick(); assert.equal(doc.querySelectorAll('.fg-cache-row').length, 1); assert(!doc.querySelector('img')); assert(doc.querySelector('[data-summary]').textContent.includes('2.1 KB'));
 const search = doc.querySelector('[data-search]'); search.value = '不存在'; search.dispatchEvent(new win.Event('input')); assert.equal(doc.querySelectorAll('.fg-cache-row').length, 0);
 search.value = '試験歌手'; search.dispatchEvent(new win.Event('input')); assert.equal(doc.querySelectorAll('.fg-cache-row').length, 1);
 const buttons = [...doc.querySelectorAll('.fg-cache-row button')];
 confirm = false; buttons.find(b => b.textContent === '删除').click(); await tick(); assert.equal(deletes, 0);
 buttons.find(b => b.textContent === '播放并编辑').click(); await tick(); assert.equal(plays, 1); assert(!doc.querySelector('.fg-cache-manager'));
 assert(changes >= 1); editor.destroy(); assert(!doc.querySelector('.fg-edit-bar'));
 console.log('Editor UI passed: delegated input, IME, Enter/save, unsaved guard, disk failure, track changes, restore, management search and escaped content.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => win.close());
