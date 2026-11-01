// Real filesystem test of the BetterNCM adapter; no child process or user cache.
'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { browserTransport } = require('../src/external.js');
(async () => {
 const privateRoot=path.resolve(__dirname,'private');await fs.mkdir(privateRoot,{recursive:true});
 const dir=await fs.mkdtemp(path.join(privateRoot,'纠音保存-'));
 assert(path.resolve(dir).startsWith(privateRoot+path.sep));
 let fault='',drift=null,executions=0,renameCalls=0;
 const disk={
  exists:async p=>{try{await fs.access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  readFileText:async p=>{if(drift&&p===drift.path){const value=drift.value;drift=null;await fs.writeFile(p,value);}return fs.readFile(p,'utf8');},
  writeFile:async(p,blob)=>{assert.equal(path.dirname(p),dir);if(fault==='write')return false;const data=Buffer.from(await blob.arrayBuffer());await fs.writeFile(p,fault==='corrupt'?Buffer.from('partial'):data);return true;},
  remove:async p=>{assert.equal(path.dirname(p),dir);assert(/^(?:[12]\.json)(?:\.tmp-[a-f0-9]{32})?$/.test(path.basename(p)));await fs.unlink(p);return true;}
 };
 const app={exec:()=>{executions++;throw Error('Cache operations must not execute a process');}};
 const bn={app,fs:disk,betterncmFetch:async route=>{
  const u=new URL(route,'http://localhost');assert.equal(u.pathname,'/fs/rename');
  const from=u.searchParams.get('path'),to=u.searchParams.get('dest');
  assert.equal(path.dirname(from),dir);assert.equal(path.dirname(to),dir);renameCalls++;
  if(fault==='rename')return new Response('unavailable',{status:500});
  await fs.rename(from,to);return new Response('ok');
 }};
 const storage=browserTransport(bn,{pluginPath:path.resolve(__dirname,'../src')}).fs;
 const file=path.join(dir,'1.json'),second=path.join(dir,'2.json');
 const initial=JSON.stringify({text:'空をみる',userEdits:[]}),next=JSON.stringify({text:'空をみる',userEdits:[{reading:'うみ',note:'literal $() and quotes remain data'}]});
 try{
  await storage.atomicWrite(file,initial,null);assert.equal(await fs.readFile(file,'utf8'),initial);
  await storage.atomicWrite(file,next,initial);assert.equal(await fs.readFile(file,'utf8'),next);
  await assert.rejects(storage.atomicWrite(file,initial,initial),/缓存已变化/);assert.equal(await fs.readFile(file,'utf8'),next);
  await assert.rejects(storage.atomicWrite(file,'invalid-json',next));assert.equal(await fs.readFile(file,'utf8'),next);
  for(const kind of ['write','corrupt','rename']){
   fault=kind;await assert.rejects(storage.atomicWrite(file,initial,next));fault='';
   assert.equal(await fs.readFile(file,'utf8'),next,'Failed staging/replacement preserves the original');
   assert.deepEqual(await fs.readdir(dir),['1.json']);
  }
  const changed=JSON.stringify({text:'外部修改'});drift={path:file,value:changed};
  await assert.rejects(storage.atomicWrite(file,initial,next),/缓存已变化/);assert.equal(await fs.readFile(file,'utf8'),changed);
  const parallel=await Promise.allSettled([storage.atomicWrite(file,initial,changed),storage.atomicWrite(file,next,changed)]);
  assert.deepEqual(parallel.map(x=>x.status),['fulfilled','rejected']);assert.equal(await fs.readFile(file,'utf8'),initial);
  const direct=browserTransport({app,fs:{...disk,rename:async(a,b)=>{await fs.rename(a,b);return true;}}},{pluginPath:''}).fs;
  const before=renameCalls;await direct.atomicWrite(second,next,null);assert.equal(renameCalls,before);assert.equal(await fs.readFile(second,'utf8'),next);
  await direct.remove(second);
  const missing=browserTransport({app,fs:disk},{pluginPath:''}).fs;
  await assert.rejects(missing.atomicWrite(file,next,initial),/缺少文件替换接口/);assert.equal(await fs.readFile(file,'utf8'),initial);
  await storage.remove(file);assert(!await storage.exists(file));assert.deepEqual(await fs.readdir(dir),[]);
  assert.equal(executions,0);
  console.log('Filesystem save passed: UTF-8 paths, verified temporary writes, built-in rename routes, stale/concurrent save rejection, staging/replace failures, cleanup and deletion; zero process launches.');
 }finally{
  for(const name of await fs.readdir(dir)){assert(/^(?:[12]\.json)(?:\.tmp-[a-f0-9]{32})?$/.test(name));await fs.unlink(path.join(dir,name));}
  await fs.rmdir(dir);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
