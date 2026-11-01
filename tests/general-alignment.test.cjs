'use strict';
const assert=require('node:assert/strict'),core=require('../src/external-core.js'),edits=require('../src/user-edits.js');
const line=segments=>({text:segments.map(s=>s.text).join(''),segments});
const ruby=(text,rt)=>({text,rt}),plain=text=>({text});
const speech=segments=>segments.map(s=>core.kana(s.rt||s.text,'hiragana')).join('').replace(/[\s「」！!🌟]/gu,'');
const prepare=(lines,originals)=>core.prepare({provider:'utaten',lines},originals);
const source=line([ruby('星','ほし'),plain('の'),ruby('記録','きろく'),plain('を'),ruby('胸','むね'),plain('にしまって'),ruby('歩','ある'),plain('く')]);
for(const target of ['星の記憶を胸にしまって歩く','🌟「星の記憶を胸にしまって歩く！」']){
	const result=core.segmentsFor(target,prepare([source]),'hiragana');
	assert(result,'An unseen kanji difference must not depend on a word-pair list');
	assert.equal(result.map(s=>s.text).join(''),target);assert.equal(speech(result),speech(source.segments));
	assert(result.some(s=>s.text==='記憶'&&s.rt==='きろく'));
}
const lantern=line([ruby('胸','むね'),plain('の'),ruby('光','ひかり'),plain('を'),ruby('抱','だ'),plain('いて'),ruby('歩','ある'),plain('き'),ruby('続','つづ'),plain('ける')]);
for(const target of ['胸の灯りを抱いて歩き続ける','胸の光だけを抱いて歩き続ける','胸の光を抱いて歩き続けるね']){
	const result=core.segmentsFor(target,prepare([lantern]),'hiragana');
	assert(result,'Different-length text must retain website speech');assert.equal(result.map(s=>s.text).join(''),target);assert.equal(speech(result),speech(lantern.segments));
}
const extra=line([ruby('胸','むね'),plain('の'),ruby('光','ひかり'),plain('だけを'),ruby('抱','だ'),plain('いて'),ruby('歩','ある'),plain('き'),ruby('続','つづ'),plain('ける')]);
const unicodeLine=line([ruby('𠮷','よし'),plain('の'),...lantern.segments]);
const unicodeTarget='🌟「吉の'+lantern.text.replace('光','灯り')+'！」',unicodeResult=core.segmentsFor(unicodeTarget,prepare([unicodeLine]),'hiragana');
assert(unicodeResult);assert.equal(unicodeResult.map(s=>s.text).join(''),unicodeTarget);assert.equal(speech(unicodeResult),speech(unicodeLine.segments));
const deleted=core.segmentsFor(lantern.text,prepare([extra]),'hiragana');assert(deleted);assert.equal(speech(deleted),speech(extra.segments));
const before=line([ruby('赤','あか'),plain('い'),ruby('空','そら'),plain('が'),ruby('見','み'),plain('えた')]);
const after=line([ruby('雨','あめ'),plain('の'),ruby('音','おと'),plain('を'),ruby('聞','き'),plain('いていた')]);
const middle=line([ruby('未来','みらい'),plain('へ'),ruby('進','すす'),plain('もう')]);
const rows=[before.text,'明日へ',after.text],context=prepare([before,middle,after],rows);
assert.equal(core.segmentsFor('明日へ',prepare([middle]),'hiragana'),null,'A short isolated rewrite is unconfirmed');
const short=core.segmentsFor('明日へ',context,'hiragana');assert(short,'Two surrounding exact lines establish the short line');assert.equal(short.map(s=>s.text).join(''),'明日へ');assert.equal(speech(short),speech(middle.segments));
const atomic=line([ruby('漢','かん'),ruby('字','じ')]);
const merged=core.segmentsFor('かんじ',prepare([before,atomic,after],[before.text,'かんじ',after.text]),'hiragana');
assert(merged);assert.deepEqual(merged,[ruby('かんじ','かんじ')],'Ambiguous word boundaries merge complete website readings instead of splitting them');
const kanaLine=line([ruby('星','ほし'),plain('をだいてゆっくりあるきだした')]);
const kanaTarget=kanaLine.text.replace('ゆっくり','ゆつくり');const kanaResult=core.segmentsFor(kanaTarget,prepare([kanaLine]),'hiragana');assert(kanaResult);assert.equal(speech(kanaResult),speech(kanaLine.segments));
const conflict=structuredClone(source);conflict.segments.find(s=>s.text==='記録').rt='おもいで';
assert.equal(core.segmentsFor('星の記憶を胸にしまって歩く',prepare([source,conflict]),'hiragana'),null,'Different website readings remain ambiguous');
assert.equal(core.segmentsFor('海の魚を探して泳いでいる',prepare([source]),'hiragana'),null,'A different sentence has insufficient evidence');
const decoy=line([ruby('星','ほし'),plain('の'),ruby('記憶','おもいで'),plain('を'),ruby('胸','むね'),plain('にしまって'),ruby('歩','ある'),plain('く')]);
const bounded=prepare([before,source,after,decoy],[before.text,decoy.text,after.text]);
const ordered=core.segmentsFor(decoy.text,bounded,'hiragana');assert(ordered.some(s=>s.text==='記憶'&&s.rt==='きろく'),'Surrounding lines exclude an otherwise exact match in a different verse');
const exact=core.segmentsFor(decoy.text,prepare([source,decoy]),'hiragana');assert(exact.some(s=>s.text==='記憶'&&s.rt==='おもいで'),'Without conflicting positional evidence exact text wins');
assert.equal(core.segmentsFor('明日へ',prepare([before,middle,after],[before.text,'明日へ',after.text,'明日へ']),'hiragana'),null,'An unconfirmed repeated occurrence must not borrow the confirmed occurrence');
const romaRecord={provider:'utanet',lines:[{text:source.text,romaji:'website-romaji'}]};let called=0;
const fromRoma=core.segmentsFor(decoy.text,core.prepare(romaRecord),'hiragana',(text,romaji)=>{called++;assert.equal(text,source.text);assert.equal(romaji,'website-romaji');return source.segments;});
assert.equal(called,1);assert.equal(speech(fromRoma),speech(source.segments),'Uta-Net readings are resolved on the website text before projection');
const parenthetical=[ruby('宇宙','そら'),{text:'(そら)',hidden:true},plain('を'),ruby('見上','みあ'),plain('げて'),ruby('歩','ある'),plain('き'),ruby('続','つづ'),plain('ける')],parentheticalText=parenthetical.map(s=>s.text).join('');
const romaParentheses=core.prepare({provider:'utanet',lines:[{text:parentheticalText,romaji:'website-romaji'}]});
const sameParentheses=core.segmentsFor(parentheticalText,romaParentheses,'hiragana',()=>parenthetical);assert(sameParentheses.some(s=>s.hidden),'Exact Uta-Net resolution retains existing hidden reading parentheses');
const changedParentheses=core.segmentsFor(parentheticalText.replace('宇宙','空'),romaParentheses,'hiragana',()=>parenthetical);
assert(changedParentheses);assert.equal(speech(changedParentheses.filter(s=>!s.hidden)),speech(parenthetical.filter(s=>!s.hidden)),'A mapped line must not pronounce hidden reading parentheses twice');
const record={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/test/',lines:[source],userEdits:[]};
const annotated=edits.annotate(record,decoy.text,core.segmentsFor(decoy.text,prepare([source]),'hiragana'),'hiragana');
const anchor=annotated.find(s=>s.text==='記憶').edit,changed=edits.update(record,anchor,'きおく');
assert(edits.annotate(changed,decoy.text,annotated,'hiragana').some(s=>s.text==='記憶'&&s.rt==='きおく'));assert.equal(record.lines[0].text,source.text);
const longSource=line(Array.from({length:60},()=>[ruby('漢','かん'),ruby('字','じ')]).flat()),longTarget='語句'.repeat(40);
const longMerged=core.segmentsFor(longTarget,prepare([before,longSource,after],[before.text,longTarget,after.text]),'hiragana');
assert(longMerged.some(s=>s.rt&&s.rt.length>100),'A confirmed rewrite may merge a long phrase');
const longRecord={...record,lines:[longSource]},longAnnotated=edits.annotate(longRecord,longTarget,longMerged,'hiragana'),longAnchor=longAnnotated.find(s=>s.edit&&s.edit.original.length>100).edit;
const longRevision=edits.update(longRecord,longAnchor,'かな'.repeat(80));assert(edits.annotate(longRevision,longTarget,longMerged,'hiragana').some(s=>s.rt==='かな'.repeat(80)),'Merged phrases remain editable beyond the former word-length limit');
assert.throws(()=>edits.reading('あ'.repeat(1001)),/1000/);
assert(!core.matches({title:'記録の歌',artists:['試験歌手']},{title:'記憶の歌',artists:['試験歌手']}),'Search/title validation is not relaxed');
assert.equal(core.segmentsFor('夢'.repeat(300),prepare([line([ruby('空'.repeat(300),'そら')])]),'hiragana'),null,'Unconfirmed oversized comparisons remain bounded');
// Deterministic spelling edits check text and phonetic preservation across
// ambiguous character alignments, not a particular edit-path implementation.
let seed=17;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;},symbols=['漢','字','空','あ','い','を'],sounds={漢:'かん',字:'じ',空:'そら'};
for(let run=0;run<180;run++){
	const parts=Array.from({length:6+random(5)},()=>symbols[random(symbols.length)]),sourceLine=line(parts.map(c=>sounds[c]?ruby(c,sounds[c]):plain(c))),dest=[...parts];
	for(let change=0;change<1+random(3);change++){
		const at=random(dest.length),type=random(3),value=symbols[random(symbols.length)];
		if(type===0)dest[at]=value;else if(type===1)dest.splice(at,0,value);else if(dest.length>1)dest.splice(at,1);
	}
	const text=dest.join(''),result=core.segmentsFor(text,prepare([before,sourceLine,after],[before.text,text,after.text]),'hiragana');
	if(sourceLine.segments.every(s=>!s.rt)&&sourceLine.text===text){assert.equal(result,null);continue;}
	assert(result,'Confirmed generated line '+run);assert.equal(result.map(s=>s.text).join(''),text);assert.equal(speech(result),speech(sourceLine.segments),'Website speech must survive spelling edit '+run);
}
console.log('General alignment passed: unseen kanji, insertions/deletions, kana, context, phrase boundaries, ambiguity, romaji, Unicode, edits and search isolation.');
