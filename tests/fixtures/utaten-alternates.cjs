'use strict';
// Synthetic lines for unequal-length and position-confirmed script differences.
const row=(segments,target)=>({text:segments.map(s=>s.text).join(''),segments,target,
	html:segments.map(s=>s.rt?`<span class="ruby"><span class="rb">${s.text}</span><span class="rt">${s.rt}</span></span>`:s.text).join('')});
const target='空を見上げて灯りの道を歩いた';
const line=row([{text:'空',rt:'そら'},{text:'を'},{text:'見上',rt:'みあ'},{text:'げて'},{text:'光',rt:'ひかり'},{text:'の'},{text:'道',rt:'みち'},{text:'を'},{text:'歩',rt:'ある'},{text:'いた'}],target);
const context=[
	row([{text:'赤',rt:'あか'},{text:'い'},{text:'空',rt:'そら'},{text:'が'},{text:'見',rt:'み'},{text:'えた'}]),
	row([{text:'漢',rt:'かん'},{text:'字',rt:'じ'}],'かんじ'),
	row([{text:'雨',rt:'あめ'},{text:'の'},{text:'音',rt:'おと'},{text:'を'},{text:'聞',rt:'き'},{text:'いていた'}])
];
module.exports={target,line,html:line.html,context};
