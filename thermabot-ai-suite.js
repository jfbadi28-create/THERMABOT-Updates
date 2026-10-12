// THERMABOT AI V3: client-side analysis, no persistence or privileged access.
(function(root){
'use strict';
const isoDate = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x||'')) ? x : '';
const today = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Cordoba'});
const str = x => String(x ?? '').trim();
const safe = x => str(x).slice(0,1200);
const ids = new Set(['priority','stage','status','progress','nextAction','nextDueDate','blocker','specRevision','drawingRevision','system','notes','waitingFor']);
function normalize(s){return {projects:Array.isArray(s?.projects)?s.projects:[],equipment:Array.isArray(s?.equipment)?s.equipment:[],milestones:Array.isArray(s?.milestones)?s.milestones:[],documents:Array.isArray(s?.documents)?s.documents:[]};}
function analyze(source,at=today()){
 const s=normalize(source), active=s.projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status));
 const overdue=s.projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status)&&isoDate(p.nextDueDate)&&p.nextDueDate<at);
 const inconsistent=s.projects.filter(p=>(p.status==='Finalizado'&&Number(p.progress)<100)||(p.status==='Esperando tercero'&&Number(p.progress)===100));
 const blocked=active.filter(p=>str(p.blocker)||p.status==='Esperando tercero'||str(p.waitingFor));
 const order=p=>(p.priority==='Urgente'?0:p.priority==='Alta'?1:2);
 const queue=active.map(p=>({id:p.id,name:p.name,establishment:p.establishment,priority:p.priority||'No registrada',status:p.status||'No registrado',nextAction:p.nextAction||'Sin próxima acción',overdue:overdue.some(q=>q.id===p.id),blocked:blocked.some(q=>q.id===p.id)})).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||order(a)-order(b));
 return {asOf:at,counts:{projects:s.projects.length,active:active.length,blocked:blocked.length,overdue:overdue.length,inconsistent:inconsistent.length,milestones:s.milestones.length,equipment:s.equipment.length,documents:s.documents.length},queue,inconsistencies:inconsistent.map(p=>({id:p.id,name:p.name,status:p.status,progress:p.progress})),source:'Sesión local de THERMABOT; verificar sincronización con Drive.'};
}
function proposedChange(source,projectId,changes){
 const s=normalize(source),p=s.projects.find(x=>x.id===projectId);
 if(!p)return {ok:false,error:'No existe ese identificador de proyecto.'};
 if(!changes||typeof changes!=='object'||Array.isArray(changes))return {ok:false,error:'Cambios inválidos.'};
 const updates=[];
 for(const [key,raw] of Object.entries(changes)){
  if(!ids.has(key))return {ok:false,error:'Campo no permitido: '+key};
  let value=raw;
  if(key==='progress'){value=Number(raw);if(!Number.isInteger(value)||value<0||value>100)return {ok:false,error:'El avance debe ser un entero de 0 a 100.'};}
  else {value=safe(raw);if(!value)return {ok:false,error:'El campo '+key+' no puede quedar vacío.'};if(key==='nextDueDate'&&!isoDate(value))return {ok:false,error:'Fecha inválida (AAAA-MM-DD).'};}
  updates.push({field:key,before:p[key]??null,after:value});
 }
 if(!updates.length)return {ok:false,error:'No hay cambios para proponer.'};
 return {ok:true,proposal:{projectId:p.id,projectName:p.name,changes:updates,requiresApproval:true,applied:false,revision:p.updatedAt||null}};
}
function linkedDocs(source,projectId){return normalize(source).documents.filter(d=>d.projectId===projectId).map(d=>({title:safe(d.title||d.name),revision:safe(d.revision),url:/^https:\/\/(drive|docs)\.google\.com\//.test(str(d.driveUrl))?d.driveUrl:null}));}
function technicalChecklist(source,projectId){
 const p=normalize(source).projects.find(x=>x.id===projectId);if(!p)return null;
 const hvac=/hvac|climat|uta|vrf|chiller|extracci|hepa|split|roof|termom|expansi|presuri/i.test([p.system,p.name,p.sector].join(' '));
 return {projectId,scope:hvac?'HVAC / termomecánica':'General',checks:[
 {topic:'Alcance y última revisión',status:p.specRevision?'Revisión declarada: '+safe(p.specRevision):'Sin revisión registrada'},
 {topic:'Capacidad de equipos',status:'Verificar selección, memoria de cálculo y condiciones de diseño en documentación técnica'},
 {topic:'Caudales y ventilación',status:'Verificar memoria de caudales, aire exterior y balance de presiones si corresponde'},
 {topic:'Filtración y control',status:'Verificar eficiencia, ubicación, alarmas, secuencias y ensayos si corresponde'},
 {topic:'Normativa y puesta en marcha',status:'Requiere evidencia documental antes de afirmar cumplimiento'}
 ],warning:'Lista orientativa, no reemplaza una auditoría normativa ni certifica cumplimiento.'};
}
root.ThermabotAISuite=Object.freeze({analyze,proposedChange,linkedDocs,technicalChecklist});
})(typeof window!=='undefined'?window:globalThis);
