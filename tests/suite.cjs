const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../suite-core.js');
const tracker={projects:[{id:'p1',name:'Climatización',establishment:'Hospital',stage:'Cotización',status:'Activo',nextAction:'Revisar plano',targetDate:'2026-09-01',notes:'Interno',blocker:'Privado'},{id:'p2',name:'Terminado',status:'Finalizado'}],equipment:[{id:'e1',name:'UTA 01',projectId:'p1',model:'Modelo A'}],milestones:[{id:'m1',projectId:'p1',title:'Instalar UTA',status:'Cumplido',dueDate:'2026-09-01'},{id:'m2',projectId:'p2',title:'Archivado',status:'Pendiente'}],documents:[{id:'d1',projectId:'p1',title:'Plano R01',driveUrl:'https://drive.google.com/file/d/abc123/view'}]};
assert.equal(C.search(tracker,[],'climatizacion')[0].id,'p1');
assert.equal(C.search(tracker,[],'modelo a')[0].id,'e1');
const tasks=C.tasks(tracker,'2026-10-02');assert.equal(tasks.length,2);assert.equal(tasks[0].id,'next:p1');assert.equal(tasks[0].overdue,true);assert.equal(tasks[1].overdue,false);
assert.equal(C.tasks(tracker,'2026-10-02',{p1:{nextTaskStatus:'En curso'}})[0].status,'En curso');assert.equal(tracker.projects[0].status,'Activo');
assert.equal(C.projectLane({status:'Urgente'}),'Bloqueado');assert.equal(C.projectLane({status:'En revisión'}),'Activo');
const fin=C.financial({lines:[{type:'Costo',quantity:2,unitPrice:150},{type:'Ingreso',quantity:1,unitPrice:600},{type:'Presupuesto',quantity:1,unitPrice:800}]});assert.deepEqual(fin,{quoted:800,cost:300,revenue:600,profit:300,margin:50,pendingPrices:0});assert.equal(C.financial().margin,null);assert.equal(C.financial({lines:[{needsPrice:true}]}).pendingPrices,1);
const marketing=C.marketing(tracker,{p1:{quoteOutcome:'Ganada',quotedAt:'2026-10-01'}});assert.equal(marketing.conversion,100);assert.equal(C.marketing(tracker,{}).conversion,null);
const client=C.publicSnapshot(tracker.projects[0],tracker);assert.equal(client.notes,undefined);assert.equal(client.blocker,undefined);assert.equal(client.documents,undefined);assert.equal(client.milestones.length,1);
assert.equal(C.previewUrl('javascript:alert(1)'),null);assert.equal(C.previewUrl('https://drive.google.com/file/d/abc123/view'),'https://drive.google.com/file/d/abc123/preview');assert.equal(C.previewUrl('http://example.com/a.pdf'),null);
// Preserve unrelated calculations and concurrent pressure edits while saving a thermal calculation.
const source=fs.readFileSync('app-v023.js','utf8');
const apiSource=source.slice(source.indexOf('async function apiCall('),source.indexOf('async function save('));
const storage=new Map([['thermabot.proyectos.v1',JSON.stringify([{id:'b1',nombre:'Anterior',pressureNetwork:{nodes:['latest']}},{id:'b2',nombre:'Otro'}])]]);
const context={state:{projectId:'b1'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};vm.createContext(context);vm.runInContext(apiSource,context);
(async()=>{
 await context.apiCall('guardar_proyectos',[{id:'b1',nombre:'Editado',pressureNetwork:{nodes:['stale']}},{id:'b2',nombre:'Obsoleto'}]);
 const saved=JSON.parse(storage.get('thermabot.proyectos.v1'));assert.equal(saved[0].nombre,'Editado');assert.deepEqual(saved[0].pressureNetwork,{nodes:['latest']});assert.equal(saved[1].nombre,'Otro');
 // Comparison reports use the same equations as the calculator's embedded motor.
 const engineContext={};vm.createContext(engineContext);vm.runInContext(fs.readFileSync('engine.js','utf8')+'\nthis.engine=THERMABOT_ENGINE;',engineContext);
 const localPrefix=source.slice(0,source.indexOf('const MATERIALS'));
 const thermalContext={};vm.createContext(thermalContext);vm.runInContext(localPrefix+'\nthis.engine=TB_ENGINE_LOCAL;',thermalContext);
 const ambient={nombre:'Sala',largo:5,ancho:4,altura:2.6,muros:[],ventanas:[],personas:3,actividad:'sentado',iluminacionW:200,equiposW:250,equiposLatenteW:0,aireExteriorModo:'persona',aireExteriorPorPersona:30,deltaTImpulsion:11,factorSeguridad:5};const cond={ciudad:'Rosario',tempExterior:34.5,humedadExterior:55,tempInterior:24,humedadInterior:50,horaDiseno:15,latitud:-32.9};
 const a=thermalContext.engine.calcular_ambiente(ambient,cond,[]),b=engineContext.engine.calcular_ambiente(ambient,cond,[]);
 for(const field of ['total_kw','sensible_total_kw','latente_total_kw','caudal_impulsion_m3h'])assert.equal(a[field],b[field],field+' comparison parity');
 console.log('PASS: global search, completed/archived tasks, finance, CRM denominators, client privacy, safe previews, concurrent calculation preservation and engine parity');
})().catch(e=>{console.error(e);process.exitCode=1;});
