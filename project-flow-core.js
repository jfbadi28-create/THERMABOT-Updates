/* Project updates and their history share one atomic tracker record. HVAC math is untouched. */
(function(root){
  'use strict';
  const fields=['status','stage','nextAction','nextDueDate','waitingFor','waitingSince','blocker','lastMove','completedOn','installedTR','installedOn'];
  const labels={status:'Estado',stage:'Etapa',nextAction:'Próxima acción',nextDueDate:'Fecha de seguimiento',waitingFor:'Esperando a',waitingSince:'Esperando desde',blocker:'Bloqueo',lastMove:'Último movimiento'};
  function validDate(value){if(!value)return true;const d=new Date(value+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
  Object.assign(labels,{completedOn:'Fecha de finalización',installedTR:'TR instaladas',installedOn:'Fecha de instalación'});
  function output(project,input){
    const raw=input.installedTR===undefined?project.installedTR:input.installedTR;
    const installedTR=raw==null||String(raw).trim()===''?null:Number(raw);
    if(installedTR!==null&&(!Number.isFinite(installedTR)||installedTR<0))throw Error('Las TR instaladas deben ser un número mayor o igual a cero.');
    const installedOn=String(input.installedOn??project.installedOn??'').trim();
    const status=input.status??project.status;
    const completedOn=status==='Finalizado'?String(input.completedOn??project.completedOn??'').trim():'';
    for(const v of [installedOn,completedOn])if(!validDate(v)||v&&input.today&&v>input.today)throw Error('Ingresá una fecha válida que no sea futura.');
    if(installedTR!==null&&installedTR>0&&!installedOn)throw Error('Indicá la fecha en que se instaló esa capacidad.');
    if(status==='Finalizado'&&project.status!=='Finalizado'&&!completedOn)throw Error('Indicá la fecha de finalización del proyecto.');
    if(installedTR===null&&installedOn)throw Error('Ingresá las TR instaladas o quitá la fecha de instalación.');
    return {installedTR,installedOn,completedOn};
  }
  function weekly(data,workflow,today){
    const monday=value=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
    const start=monday(today),rows=[];
    for(let i=3;i>=0;i--){const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-7*i);const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);rows.push({from,to:d.toISOString().slice(0,10),planned:[],done:[]});}
    const names=new Map(data.projects.map(p=>[p.id,p.name]));
    const tasks=[...data.milestones,...data.projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status)&&p.nextAction).map(p=>({id:'next:'+p.id,projectId:p.id,title:p.nextAction,dueDate:p.nextDueDate===undefined?p.targetDate:p.nextDueDate,status:workflow[p.id]?.nextTaskStatus||'Pendiente'}))].filter(t=>names.has(t.projectId));
    let undatedDone=0;
    for(const t of tasks){const fact=workflow[t.projectId]?.taskFacts?.[t.id]||{};let completedOn=fact.completedOn||t.completedOn||'';const at=fact.completedAt||t.completedAt;if(!completedOn&&at&&Number.isFinite(new Date(at).getTime()))completedOn=new Date(at).toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'});const item={...t,project:names.get(t.projectId),completedOn};
      if(t.status==='Cumplido'&&!completedOn)undatedDone++;
      for(const r of rows){if(t.dueDate&&validDate(t.dueDate)&&t.dueDate>=r.from&&t.dueDate<=r.to)r.planned.push(item);if(t.status==='Cumplido'&&completedOn&&validDate(completedOn)&&completedOn>=r.from&&completedOn<=r.to&&completedOn<=today)r.done.push(item);}
    }
    return {rows,undatedDone};
  }
  function prepare(project,input,{actor,at,id,documents=[],expectedVersion}={}){
    if(expectedVersion!==undefined&&(project.updatedAt||'')!==expectedVersion)throw Error('El proyecto cambió mientras lo editabas. Cerrá esta ventana y revisá la actualización.');
    const patch={};
    for(const field of ['status','stage','nextAction','nextDueDate','waitingFor','blocker'])patch[field]=String(input[field]??project[field]??'').trim();
    if(!['Activo','En revisión','Urgente','Esperando tercero','Bloqueado','Finalizado','Suspendido'].includes(patch.status))throw Error('Seleccioná un estado válido.');
    if(!validDate(patch.nextDueDate))throw Error('La fecha de seguimiento no es válida.');
    if(patch.status==='Esperando tercero'&&!patch.waitingFor)throw Error('Indicá de quién o de qué estás esperando respuesta.');
    if(patch.status==='Bloqueado'&&!patch.blocker)throw Error('Indicá qué impide avanzar.');
    if(patch.status!=='Esperando tercero')patch.waitingFor='';
    patch.waitingSince=patch.status==='Esperando tercero'?(project.status==='Esperando tercero'&&project.waitingSince?project.waitingSince:input.today):'';
    const note=String(input.note||'').trim();if(note.length>3000)throw Error('La novedad debe tener hasta 3000 caracteres.');
    patch.lastMove=note||project.lastMove||'';
    Object.assign(patch,output(project,input));
    let document=null;
    if(input.documentId){const d=documents.find(d=>d.id===input.documentId&&d.projectId===project.id);if(!d)throw Error('El documento debe pertenecer a este proyecto.');document={id:d.id,title:d.title,revision:d.revision||'',driveUrl:d.driveUrl||''};}
    const changes=fields.filter(k=>String(project[k]||'')!==String(patch[k]||'')).map(field=>({field,label:labels[field],before:project[field]??'',after:patch[field]??''}));
    if(!note&&!changes.length&&!document)throw Error('Escribí una novedad o cambiá un dato antes de guardar.');
    const event={id,at,actor:String(actor||'Operador').trim(),note,changes,document};
    return {...project,...patch,updatedAt:at,followUpLog:[...(Array.isArray(project.followUpLog)?project.followUpLog:[]),event]};
  }
  const api={prepare,validDate,labels,output,weekly};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBProjectFlowCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
