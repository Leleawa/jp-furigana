'use strict';
// Minimal line supplied in the user's bug screenshots; never publish a full song.
const target = '抗えぬ沖動の暗が彼を包んだ';
const segments = [
	{ text: '抗', rt: 'あらが' }, { text: 'えぬ' }, { text: '衝動', rt: 'しょうどう' },
	{ text: 'の' }, { text: '闇', rt: 'やみ' }, { text: 'が' }, { text: '彼', rt: 'かれ' },
	{ text: 'を' }, { text: '包', rt: 'つつ' }, { text: 'んだ…' }
];
const line = { text: segments.map(s => s.text).join(''), segments };
const html = segments.map(s => s.rt ? `<span class="ruby"><span class="rb">${s.text}</span><span class="rt">${s.rt}</span></span>` : s.text).join('');
module.exports = { target, line, html };
