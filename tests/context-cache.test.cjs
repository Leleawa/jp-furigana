'use strict';
const assert=require('node:assert/strict'),{create}=require('../src/external.js');
const lines=[
	{text:'赤い空が見えた',segments:[{text:'赤',rt:'あか'},{text:'い'},{text:'空',rt:'そら'},{text:'が'},{text:'見',rt:'み'},{text:'えた'}]},
	{text:'未来へ進もう',segments:[{text:'未来',rt:'みらい'},{text:'へ'},{text:'進',rt:'すす'},{text:'もう'}]},
	{text:'雨の音を聞いていた',segments:[{text:'雨',rt:'あめ'},{text:'の'},{text:'音',rt:'おと'},{text:'を'},{text:'聞',rt:'き'},{text:'いていた'}]}
];
const record={schema:1,songId:'1',provider:'utaten',url:'https://utaten.com/lyric/test/',title:'試験曲',artists:['試験歌手'],lines,userEdits:[]};
const file='C:/Test/lyrics/jp-furigana/1.json',disk=new Map([[file,JSON.stringify(record)]]);let originals=null,requests=0;
const client=create({dataRoot:async()=>'C:/Test',originalLines:()=>originals,fs:{mkdir:async()=>true,exists:async p=>disk.has(p),readFileText:async p=>disk.get(p),writeFileText:async(p,v)=>{disk.set(p,v);return true;}},request:async()=>{requests++;throw Error('No extra requests for line context');}});
(async()=>{
	await client.load('1',async()=>{throw Error('Website cache needs no metadata');},{externalProvider:'utaten'});
	assert.equal(client.segments('明日へ','hiragana'),null);
	originals=[lines[0].text,'明日へ',lines[2].text];
	const result=client.segments('明日へ','hiragana');assert(result,'New same-track original lyrics invalidate an earlier unmatched result');
	assert.equal(result.map(s=>s.rt||s.text).join(''),'みらいへすすもう');
	await client.saveEdit(result.find(s=>s.edit).edit,'あしたへ');
	assert(client.segments('明日へ','hiragana').some(s=>s.rt==='あしたへ'),'Saving recomputes the baseline using the same original-lyric context');
	const saved=JSON.parse(disk.get(file));assert.deepEqual(saved.lines,lines);assert.equal(saved.userEdits.length,1);assert.equal(disk.size,1);assert.equal(requests,0);
	console.log('Context cache passed: no extra requests, late originals invalidate cached misses, consistent edit baseline, one JSON and preserved website fields.');
})().catch(e=>{console.error(e);process.exitCode=1;});
