/* Project updates and their history share one atomic tracker record. HVAC math is untouched. */
(function(root){
  'use strict';
  const fields=['status','stage','nextAction','nextDueDate','waitingFor','waitingSince','blocker','lastMove'];
  const labels={status:'Estado',stage:'Etapa',nextAction:'Próxima acción',nextDueDate:'Fecha de seguimiento',waitingFor:'Esperando a',waitingSince:'Esperando desde',blocker:'Bloqueo',lastMove:'Último movimiento'};
  function validDate(value){if(!value)return true;const d=new Date(value+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
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
    let document=null;
    if(input.documentId){const d=documents.find(d=>d.id===input.documentId&&d.projectId===project.id);if(!d)throw Error('El documento debe pertenecer a este proyecto.');document={id:d.id,title:d.title,revision:d.revision||'',driveUrl:d.driveUrl||''};}
    const changes=fields.filter(k=>String(project[k]||'')!==String(patch[k]||'')).map(field=>({field,label:labels[field],before:project[field]??'',after:patch[field]??''}));
    if(!note&&!changes.length&&!document)throw Error('Escribí una novedad o cambiá un dato antes de guardar.');
    const event={id,at,actor:String(actor||'Operador').trim(),note,changes,document};
    return {...project,...patch,updatedAt:at,followUpLog:[...(Array.isArray(project.followUpLog)?project.followUpLog:[]),event]};
  }
  const api={prepare,validDate,labels};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBProjectFlowCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
