/* Executive reporting from explicit project records. No HVAC math or inferred approvals. */
(function(root){
 'use strict';
 const valid=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
 const localDay=v=>{if(valid(v))return v;const d=new Date(v);return v&&Number.isFinite(d.getTime())?d.toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}):'';};
 const day=v=>valid(v)?v.split('-').reverse().join('/'):'Sin registrar';
 const active=p=>!['Finalizado','Suspendido'].includes(p.status);
 const group=p=>['Obra','Aprobación','Desarrollo'].includes(p.reportGroup)?p.reportGroup:['Obra','Puesta en marcha','Validación'].includes(p.stage)?'Obra':['Pliego','Cotización','Contratación','Adjudicado'].includes(p.stage)?'Aprobación':'Desarrollo';
 const value=v=>v==null||String(v).trim()===''?'Sin registrar':String(v).trim();
 const situation=p=>[p.status,p.stage,p.waitingFor||p.blocker,p.lastMove].filter(Boolean).join(' · ')||'Sin registrar';
 const location=p=>[p.establishment,p.sector].filter(Boolean).join(' / ')||'Sin registrar';
 function build(data,workflow={},activity=[],input={}){
  const {from,to,issued}=input;if(!valid(from)||!valid(to)||!valid(issued)||from>to||to>issued)throw Error('Revisá el período: Desde ≤ Hasta ≤ fecha de emisión.');
  const projects=data.projects.filter(p=>!input.projectId||p.id===input.projectId),ids=new Set(projects.map(p=>p.id)),current=projects.filter(active),warnings=[],missing=(p,field)=>warnings.push({projectId:p.id,project:p.name,field});
  const inPeriod=v=>valid(v)&&v>=from&&v<=to;
  const milestones=data.milestones.filter(m=>ids.has(m.projectId));
  const nextTasks=current.filter(p=>p.nextAction).map(p=>({id:'next:'+p.id,projectId:p.id,status:workflow[p.id]?.nextTaskStatus||'Pendiente',dueDate:p.nextDueDate===undefined?p.targetDate:p.nextDueDate}));
  const overdue=[...milestones,...nextTasks].filter(t=>current.some(p=>p.id===t.projectId)&&t.status!=='Cumplido'&&valid(t.dueDate)&&t.dueDate<issued);
  const obras=current.filter(p=>group(p)==='Obra'),approval=current.filter(p=>group(p)==='Aprobación'),development=current.filter(p=>group(p)==='Desarrollo');
  const decisions=current.filter(p=>p.decisionRequired||p.decisionRequest?.trim()||['Bloqueado','Urgente'].includes(p.status));
  const closed=projects.filter(p=>p.status==='Finalizado'&&inPeriod(p.completedOn));
  projects.filter(p=>p.status==='Finalizado'&&!valid(p.completedOn)).forEach(p=>missing(p,'Fecha de finalización: no se puede asignar el cierre a un período'));
  const tables={DEC:[],OBRA:[],AP:[],DES:[],FIN:[]};
  const base=p=>{if(!p.establishment)missing(p,'Establecimiento');return {location:location(p),name:value(p.name)};};
  for(const p of decisions){const b=base(p);if(!p.decisionRequest?.trim())missing(p,'Decisión o intervención requerida');tables.DEC.push({DEC_ESTABLECIMIENTO_SECTOR:b.location,DEC_PROYECTO:b.name,DEC_SITUACION:situation(p),DEC_REQUERIMIENTO:value(p.decisionRequest)});}
  for(const p of obras){const b=base(p),hits=milestones.filter(m=>m.projectId===p.id&&m.status!=='Cumplido').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')),hit=hits[0],progress=p.progress!=null&&p.progress!==''&&Number.isFinite(Number(p.progress))&&Number(p.progress)>=0&&Number(p.progress)<=100?Number(p.progress):null;if(progress===null)missing(p,'Avance técnico (%)');if(!hit)missing(p,'Próximo hito');const due=hit?.dueDate||p.targetDate;if(!valid(due))missing(p,'Fecha objetivo');tables.OBRA.push({OBRA_ESTABLECIMIENTO_SECTOR:b.location,OBRA_PROYECTO:b.name,OBRA_AVANCE:progress===null?'Sin registrar':progress.toLocaleString('es-AR')+' %',OBRA_PROXIMO_HITO:value(hit?.title),OBRA_FECHA:day(due)});}
  for(const p of approval){const b=base(p),pending=p.decisionRequest||p.waitingFor||p.blocker||p.technicalPending;if(!pending)missing(p,'Pendiente principal');if(!p.nextAction)missing(p,'Próximo paso');tables.AP.push({AP_ESTABLECIMIENTO_SECTOR:b.location,AP_PROYECTO:b.name,AP_ETAPA:value(p.stage),AP_PENDIENTE:value(pending),AP_PROXIMO_PASO:value(p.nextAction)});}
  for(const p of development){const b=base(p),year=p.targetYear|| (valid(p.targetDate)?p.targetDate.slice(0,4):'');if(!p.technicalPending)missing(p,'Pendiente técnico');if(!year)missing(p,'Año objetivo');tables.DES.push({DES_ESTABLECIMIENTO_SECTOR:b.location,DES_PROYECTO:b.name,DES_ESTADO:value(p.engineeringState||p.stage),DES_PENDIENTE:value(p.technicalPending),DES_ANIO:value(year)});}
  for(const p of closed){const b=base(p),log=(p.followUpLog||[]).filter(r=>inPeriod(localDay(r.at))).at(-1);tables.FIN.push({FIN_ESTABLECIMIENTO_SECTOR:b.location,FIN_PROYECTO:b.name,FIN_FECHA:day(p.completedOn),FIN_OBSERVACION:value(log?.note||p.lastMove)});}
  const logged=projects.flatMap(p=>(p.followUpLog||[]).map(e=>({...e,projectId:p.id,project:p.name}))),changes=[];
  for(const e of logged.filter(e=>inPeriod(localDay(e.at)))){const detail=e.note||(e.changes||[]).map(c=>(c.label||c.field)+': '+value(c.before)+' → '+value(c.after)).join('; ')||'Datos actualizados';changes.push({at:e.at,text:day(localDay(e.at))+' · '+e.project+': '+detail});}
  for(const e of activity.filter(e=>ids.has(e.projectId)&&inPeriod(localDay(e.at)))){if(logged.some(l=>l.projectId===e.projectId&&Math.abs(new Date(l.at)-new Date(e.at))<1500))continue;const p=projects.find(p=>p.id===e.projectId);changes.push({at:e.at,text:day(localDay(e.at))+' · '+p.name+': '+[e.title,e.detail].filter(Boolean).join(' · ')});}
  changes.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  const suggested=decisions.map(p=>p.decisionRequest||p.nextAction).filter(Boolean).slice(0,3).join('; ')||current.map(p=>p.nextAction).filter(Boolean).slice(0,3).join('; ');
  const scalars={FECHA_INFORME:day(issued),DESTINATARIO:value(input.recipient),CARGO_DESTINATARIO:value(input.recipientRole),PERIODO:day(from)+' al '+day(to),TOTAL_ACTIVOS:current.length,TOTAL_EN_OBRA:obras.length,TOTAL_APROBACION_CONTRATACION:approval.length,TOTAL_ESPERANDO_TERCEROS:current.filter(p=>p.status==='Esperando tercero').length,TOTAL_VENCIDOS:overdue.length,TOTAL_FINALIZADOS_PERIODO:closed.length,PRIORIDAD_PROXIMO_PERIODO:value(input.priority||suggested),FIRMANTE:value(input.signer),CARGO_FIRMANTE:value(input.signerRole)};
  const seen=new Set();return {scalars,tables,changes:changes.map(c=>c.text),warnings:warnings.filter(w=>{const key=w.projectId+':'+w.field;if(seen.has(key))return false;seen.add(key);return true;}),suggested,projectCount:projects.length,from,to,issued,projectIds:[...ids]};
 }
 const api={build,group,valid,localDay,day};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBReportCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
