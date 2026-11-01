'use strict';
// Minimal excerpt from the user's screenshot; no complete song or private cache.
const target = '終末旗を送ってやるから';
const segments = [{text:'週末',rt:'しゅうまつ'},{text:'旗',rt:'はた'},{text:'を'},{text:'送',rt:'おく'},{text:'ってやるから'}];
const line = {text:segments.map(s=>s.text).join(''),segments};
const html = segments.map(s=>s.rt?`<span class="ruby"><span class="rb">${s.text}</span><span class="rt">${s.rt}</span></span>`:s.text).join('');
module.exports = {target,line,html};
