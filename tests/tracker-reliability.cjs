const fs=require('fs'),vm=require('vm'),assert=require('assert');
const client=fs.readFileSync('tracker-drive-autosync.js','utf8');
function setup(){
 const mem=new Map(); class Storage{getItem(k){return mem.get(k)||null}setItem(k,v){mem.set(k,v)}removeItem(k){mem.delete(k)}}
 const calls=[];const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{closest(){return null},classList:{toggle(){},remove(){}},style:{}});return elements.get(id)};
 const ctx={Storage,localStorage:new Storage(),document:{readyState:'loading',addEventListener(){},getElementById:el,activeElement:null,hidden:false},window:{},Headers,Date,JSON,Number,Object,Array,String,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},location:{reload(){throw Error('unexpected reload')}},fetch:async(url,opts={})=>{calls.push({url,opts});if(url.includes('?fields='))return{ok:true,json:async()=>({sheets:[{properties:{title:'Proyectos',sheetId:1}}]})};return{ok:true,json:async()=>({ok:true,counts:{projects:1}})}}};
 vm.createContext(ctx);vm.runInContext(client.replace(/if\(document.readyState==='loading'\)[\s\S]*$/, 'window.test={state,pull,poll,push,hookLocalStorage,sameState,atomicSheetWrite,directRead};})();'),ctx);
 return {ctx,t:ctx.window.test,calls,mem};
}
(async()=>{
 let {ctx,t,calls}=setup();
 assert(t.sameState({projects:[],updatedAt:'a'},{projects:[],updatedAt:'b'}));
 t.state.mode='server';t.state.connected=true;
 const local={projects:[{id:'local'}],equipment:[],milestones:[],documents:[]};ctx.localStorage.setItem('thermabot.tracker.v1',JSON.stringify(local));
 t.hookLocalStorage();ctx.localStorage.setItem('thermabot.tracker.v1',JSON.stringify(local));
 ctx.fetch=async()=>({ok:true,json:async()=>({projects:[{id:'remote'}],equipment:[],milestones:[],documents:[]})});
 await t.pull({reload:false});assert.equal(JSON.parse(ctx.localStorage.getItem('thermabot.tracker.v1')).projects[0].id,'local');
 await t.poll();assert.equal(JSON.parse(ctx.localStorage.getItem('thermabot.tracker.v1')).projects[0].id,'local');
 ctx.fetch=async()=>({ok:true,json:async()=>({projects:[{id:'remote-new'}],equipment:[],milestones:[],documents:[]})});
 await t.push();assert.equal(ctx.localStorage.getItem('thermabot.tracker.pending.v1'),'1');
 ({ctx,t,calls}=setup());t.state.token='test';
 await t.atomicSheetWrite([{range:'Proyectos!A1',values:[['id'],['p1']]}]);
 assert.equal(calls.filter(c=>c.opts.method==='POST').length,1);
 const payload=JSON.parse(calls[1].opts.body);assert.equal(payload.requests[0].updateCells.range.sheetId,1);assert(!calls.some(c=>c.url.includes('batchClear')));
 await t.directRead();const url=calls[2].url;for(const sheet of ['Proyectos','Equipos','Hitos','Documentos'])assert(url.includes(sheet+'!')||url.includes(sheet+'%21'));
 ({ctx,t,calls}=setup()); t.state.mode='server'; t.state.connected=true; t.state.remoteSnapshot=local;
 ctx.localStorage.setItem('thermabot.tracker.v1',JSON.stringify(local)); t.hookLocalStorage();
 let cloud=local; let puts=0; let queued=0;
 ctx.setTimeout=()=>{queued++};
 ctx.fetch=async(url,opts={})=>{if(opts.method==='PUT'){puts++;cloud=JSON.parse(opts.body);ctx.localStorage.setItem('thermabot.tracker.v1',JSON.stringify({...local,projects:[{id:'changed-during-write'}]}));return {ok:true,json:async()=>({ok:true,counts:{projects:1}})}}return {ok:true,json:async()=>cloud}};
 await t.push(); assert.equal(puts,1); assert.equal(ctx.localStorage.getItem('thermabot.tracker.pending.v1'),'1'); assert(queued>0); assert(ctx.localStorage.getItem('thermabot.tracker.sync-base.v1'));
 await t.push(); assert.equal(ctx.localStorage.getItem('thermabot.tracker.pending.v1'),null); assert.equal(cloud.projects[0].id,'changed-during-write');
 ctx.localStorage.setItem('thermabot.tracker.pending.v1','1');ctx.fetch=async()=>{throw Error('offline')};
 await assert.rejects(t.push(),/offline/);assert.equal(ctx.localStorage.getItem('thermabot.tracker.pending.v1'),'1');assert(!t.state.syncing);
 console.log('PASS: pending pull/poll protection, conflict preservation, qualified ranges, atomic Sheets write, timestamp-independent comparison, edits during writes, retry, readback verification and offline preservation');
})().catch(e=>{console.error(e);process.exitCode=1});

