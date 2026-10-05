const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('cloud-sync.js','utf8');
const TRACKER='thermabot.tracker.v1',PENDING='thermabot.cloud.pending.v1';
function setup({preview=false,stored={}}={}){
  const mem=new Map(Object.entries(stored)),elements=new Map(),events=new Map(),scheduled=[];
  class Storage{getItem(k){return mem.has(k)?mem.get(k):null;}setItem(k,v){mem.set(k,String(v));}}
  const el=id=>{if(!elements.has(id))elements.set(id,{id,textContent:'',dataset:{},style:{},classList:{values:new Map(),toggle(k,v){this.values.set(k,v);}},setAttribute(){},after(){}});return elements.get(id);};
  const window={TBDesignPreview:preview,addEventListener(k,fn){if(!events.has(k))events.set(k,[]);events.get(k).push(fn);},dispatchEvent(e){for(const fn of events.get(e.type)||[])fn(e);}};
  const initial={format:'thermabot-cloud-v1',revision:'r1',updatedAt:'2026-10-04T22:24:54.739Z',values:{[TRACKER]:JSON.stringify({projects:[{id:'p1',name:'Original'}]})}};
  let handler=async(_url,o={})=>{if(o.method==='PUT'){const value=JSON.parse(o.body);return{...value,revision:'r2',updatedAt:'2026-10-04T22:35:00Z'};}return initial;};
  const calls=[];
  const context={window,parent:window,Storage,localStorage:new Storage(),document:{currentScript:{src:'https://example.com/cloud-sync.js'},getElementById:id=>elements.get(id)||null,createElement:()=>el('cloudSaveStatus'),body:{append(){}}},URL,Date,AbortSignal,CustomEvent:class{constructor(type,opts={}){this.type=type;this.detail=opts.detail;}},setTimeout(fn){scheduled.push(fn);return scheduled.length;},clearTimeout(){},setInterval(fn){context.poll=fn;},fetch:async(url,o={})=>{calls.push({url,o});const value=await handler(url,o);return{ok:true,headers:{get:()=> 'application/json'},json:async()=>value};}};
  vm.createContext(context);vm.runInContext(source,context);
  return{context,cloud:window.TBCloud,mem,el,calls,initial,scheduled,setHandler:fn=>handler=fn,ready:window.TBCloudReady};
}
test('A loaded Drive base and last server timestamp remain confirmed when the tracker renders',async()=>{
  const h=setup();await h.ready;assert.equal(h.cloud.state().verified,true);assert.equal(h.cloud.state().updatedAt,h.initial.updatedAt);
  const tracker=fs.readFileSync('tracker.js','utf8'),start=tracker.indexOf('  function renderDrive(){'),end=tracker.indexOf('  function bindEvents()',start);
  for(const id of ['driveQuickBtn','trackerSaveStatus','driveStateTitle','driveFolderState','driveFileState','driveSyncState','driveModeState','pushDriveBtn','pullDriveBtn','connectDriveBtn','openDriveFolder','driveMessage'])h.el(id);
  h.context.$=h.el;vm.runInContext(tracker.slice(start,end),h.context);h.context.renderDrive();
  assert.equal(h.el('driveQuickBtn').textContent,h.cloud.status());assert.equal(h.el('driveStateTitle').textContent,h.cloud.status());assert.equal(h.el('driveFileState').textContent,'THERMABOT-base.json');assert.match(h.el('driveSyncState').textContent,/19:24/);assert.equal(h.el('driveModeState').textContent,'Drive + copia local');
});
test('A change turns confirmation off until PUT succeeds',async()=>{
  const h=setup();await h.ready;h.context.localStorage.setItem(TRACKER,'{"projects":[{"id":"p1","name":"Editado"}]}');
  assert.equal(h.cloud.state().pending,true);assert.equal(h.cloud.state().verified,false);await h.cloud.save();
  assert.equal(h.cloud.state().verified,true);assert.equal(h.cloud.state().updatedAt,'2026-10-04T22:35:00Z');assert.equal(h.mem.get(PENDING),'0');assert.equal(JSON.parse(h.calls.find(c=>c.o.method==='PUT').o.body).revision,'r1');
});
test('Manual verification without changes makes only GET and recovers from an offline error',async()=>{
  const h=setup();await h.ready;h.setHandler(async()=>{throw Error('Sin conexión');});await h.cloud.check();assert.equal(h.cloud.state().phase,'error');assert.equal(h.cloud.state().verified,false);
  h.setHandler(async()=>h.initial);await h.cloud.save();assert.equal(h.cloud.state().verified,true);assert(h.calls.every(c=>!c.o.method));
});
test('Failed save preserves pending local data and the previous confirmed timestamp',async()=>{
  const h=setup();await h.ready;const local='{"projects":[{"id":"p1","name":"No perder"}]}';h.context.localStorage.setItem(TRACKER,local);h.setHandler(async()=>{throw Error('Error de permisos');});await h.cloud.save();
  assert.equal(h.mem.get(TRACKER),local);assert.equal(h.mem.get(PENDING),'1');assert.equal(h.cloud.state().verified,false);assert.equal(h.cloud.state().updatedAt,h.initial.updatedAt);assert.equal(h.cloud.state().busy,false);
});
test('Edits made during an upload stay pending and are sent on the next save',async()=>{
  const h=setup();await h.ready;h.context.localStorage.setItem(TRACKER,'{"projects":[{"id":"p1","name":"Primero"}]}');let body;
  h.setHandler(async(_url,o)=>{body=JSON.parse(o.body);h.context.localStorage.setItem(TRACKER,'{"projects":[{"id":"p1","name":"Segundo"}]}');return{revision:'r2',updatedAt:'2026-10-04T22:35:00Z'};});await h.cloud.save();assert.equal(h.cloud.state().pending,true);assert.equal(h.cloud.state().verified,false);
  h.setHandler(async(_url,o)=>{body=JSON.parse(o.body);return{revision:'r3',updatedAt:'2026-10-04T22:36:00Z'};});await h.cloud.save();assert.equal(h.cloud.state().verified,true);assert.equal(JSON.parse(body.values[TRACKER]).projects[0].name,'Segundo');assert.equal(body.revision,'r2');
});
test('Checking a changed remote revision does not replace local records or silently rebase',async()=>{
  const h=setup();await h.ready;const local=h.mem.get(TRACKER);h.setHandler(async()=>({...h.initial,revision:'another-device',values:{[TRACKER]:'{"projects":[]}'}}));await h.cloud.check();assert.equal(h.cloud.state().phase,'remote-change');assert.equal(h.cloud.state().verified,false);assert.equal(h.mem.get(TRACKER),local);
  h.context.localStorage.setItem(TRACKER,'{"projects":[{"id":"p1","name":"Local"}]}');let revision;h.setHandler(async(_url,o)=>{revision=JSON.parse(o.body).revision;throw Error('Conflicto');});await h.cloud.save();assert.equal(revision,'r1');assert.equal(h.mem.get(PENDING),'1');
});
test('Local design preview never contacts Drive or claims a confirmed save',async()=>{
  const h=setup({preview:true});await h.ready;await h.cloud.save();await h.cloud.check();assert.equal(h.calls.length,0);assert.equal(h.cloud.state().phase,'preview');assert.equal(h.cloud.state().verified,false);
});
