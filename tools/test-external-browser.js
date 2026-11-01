/* Manual client smoke test. Evaluate this file, then call the returned async
 * function with an absolute repository path. It uses only tests/private, never
 * changes the playing song/configuration, and forbids process execution. */
(function () {
  'use strict';
  return async function testExternalBrowser(repository) {
    const repo=repository.replace(/\\/g,'/').replace(/\/$/,''),bn=betterncm;
    const token=[...crypto.getRandomValues(new Uint8Array(8))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const base=repo+'/tests/private/browser-'+token,report={tests:[],processLaunches:0},modules={};
    const persist=()=>bn.fs.writeFile(base+'/report.json',new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
    const check=(value,message)=>{if(!value)throw Error(message);};
    await bn.fs.mkdir(base);
    for(const name of ['furigana.js','external-core.js','user-edits.js','external.js']){
      const source=await bn.fs.readFileText(repo+'/src/'+name),module={exports:{}};
      new Function('module','require',source)(module,key=>{check(modules[key],'Unknown test module');return modules[key];});
      modules['./'+name]=module.exports;
    }
    const app={getDataPath:async()=>base};
    Object.defineProperty(app,'exec',{get(){report.processLaunches++;throw Error('Process APIs forbidden by browser smoke test');}});
    const library=modules['./external.js'],transport=library.browserTransport({app,fs:bn.fs,betterncmFetch:bn.betterncmFetch},{});
    let requests=0;
    const track={title:'残酷な天使のテーゼ',artists:['高橋洋子']};
    for(const provider of ['utaten','utanet']){
      const item={provider,requests:[]},settings={externalProvider:provider,externalAutoRetry:'off'},id=provider==='utaten'?'990000000001':'990000000002';
      const start=performance.now();
      const client=library.create({...transport,request:async(url,cancelled)=>{
        const began=performance.now();requests++;
        try{return await transport.request(url,cancelled);}
        finally{item.requests.push({host:new URL(url).hostname,milliseconds:Math.round(performance.now()-began)});}
      }});
      try{
        await client.load(id,async()=>track,settings,true);
        const state=client.inspect();check(state.ready&&state.source===provider&&!state.warning,state.error||state.warning||state.status);
        item.fetchMs=Math.round(performance.now()-start);
        const record=await client.manage(id,settings,'read');item.lines=record.lines.length;
        const before=requests;await client.load(id,async()=>{throw Error('Cache hit requested metadata');},settings);
        item.cacheHitNoNetwork=requests===before;check(item.cacheHitNoNetwork,'Cache hit issued a request');
        if(provider==='utaten'){
          const line=record.lines.find(l=>l.segments.some(s=>s.rt));check(line,'No ruby line');
          const unit=client.segments(line.text,'hiragana').find(s=>s.edit&&s.rt);check(unit,'No editable unit');
          await client.saveEdit(unit.edit,'てすと');
          const changed=await client.manage(id,settings,'read');item.correctionSaved=changed.userEdits.length===1;
          check(item.correctionSaved&&JSON.stringify(changed.lines)===JSON.stringify(record.lines),'Website data changed or correction missing');
          await client.manage(id,settings,'restore');const restored=await client.manage(id,settings,'read');
          item.restored=restored.userEdits.length===0;check(item.restored,'Restore failed');
        }
        const listing=await client.list(settings);check(listing.rows.some(r=>r.songId===id),'Saved file missing from manager');
        await client.manage(id,settings,'delete');
        item.deleted=!await bn.fs.exists(state.cachePath+'/'+id+'.json');check(item.deleted,'Cache deletion failed');
        item.editsNoNetwork=requests===before;check(item.editsNoNetwork,'Editing/deletion requested website data');
        item.success=true;
      }catch(error){item.error=String(error.message||error);}
      finally{client.stop();item.totalMs=Math.round(performance.now()-start);report.tests.push(item);await persist();}
    }
    report.framesRemaining=document.querySelectorAll('iframe[src="https://utaten.com/robots.txt"][sandbox="allow-same-origin"]').length;
    report.finished=true;await persist();console.log('Browser website/save smoke test',report,'Report:',base+'/report.json');
    return {report,path:base+'/report.json'};
  };
})();
