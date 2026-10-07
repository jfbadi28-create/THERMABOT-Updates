const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
test('Saving a previously loaded thermal iframe preserves later water calculations and drafts',()=>{
 const js=stripTypeScriptTypes(fs.readFileSync('quadri/src/ui/app.ts','utf8'),{mode:'strip'}),start=js.indexOf('function store(){'),end=js.indexOf('function scheduleStore()',start);
 const latest={version:3,waterDrafts:{p:{sourceId:'thermal-1',config:{foo:'documented'}}},waterCalculations:[{id:'water-1',projectId:'p',sourceId:'thermal-1'}]},mem=new Map([['thermal',JSON.stringify(latest)]]),state={version:3,waterDrafts:{},waterCalculations:[],rooms:[],saved:[{id:'new-thermal'}]};
 const ctx={state,STORAGE_KEY:'thermal',storageFailure:'',checkpointRoom(){},validateTree(){},toast(m){throw Error(m);},app:{querySelector(){return null;}},localStorage:{getItem(k){return mem.get(k)||null;},setItem(k,v){mem.set(k,v);}}};vm.createContext(ctx);vm.runInContext(js.slice(start,end),ctx);assert.equal(ctx.store(),true);const saved=JSON.parse(mem.get('thermal'));assert.deepEqual(saved.waterCalculations,latest.waterCalculations);assert.deepEqual(saved.waterDrafts,latest.waterDrafts);assert.equal(saved.saved[0].id,'new-thermal');
});
