(function(root){
'use strict';
function complete(data,taskId,input){
 const p=data.projects.find(p=>p.id===input.projectId);if(!p)throw Error('El proyecto ya no existe.');
 if((p.updatedAt||'')!==input.expectedVersion)throw Error('El proyecto cambió. Cerrá y revisá sus datos.');
 const next=String(input.nextAction||'').trim(),due=input.nextDueDate||'';
 if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z'))||new Date(due+'T12:00:00Z').toISOString().slice(0,10)!==due))throw Error('Elegí una fecha válida.');
 if(due&&!next)throw Error('Ingresá la próxima acción para asignarle fecha.');
 if(next&&!due)throw Error('Elegí una fecha para la próxima acción.');
 if(taskId.startsWith('next:')){if(taskId!=='next:'+p.id||!p.nextAction)throw Error('La tarea ya cambió.');data.milestones.push({id:input.completedId,projectId:p.id,title:p.nextAction,type:'Otro',status:'Cumplido',dueDate:p.nextDueDate===undefined?p.targetDate||'':p.nextDueDate,completedAt:input.at,owner:p.owner||'',notes:'Completada desde el seguimiento diario'});p.nextAction=next;p.nextDueDate=due;
 }else{const task=data.milestones.find(t=>t.id===taskId&&t.projectId===p.id);if(!task||task.status==='Cumplido')throw Error('La tarea ya cambió.');task.status='Cumplido';task.completedAt=input.at;if(next)data.milestones.push({id:input.nextId,projectId:p.id,title:next,type:'Otro',status:'Pendiente',dueDate:due,owner:task.owner||p.owner||''});}
 p.updatedAt=input.at;p.followUpLog=p.followUpLog||[];p.followUpLog.push({id:input.eventId,at:input.at,actor:input.actor,note:'Tarea cumplida'+(next?' · Siguiente: '+next:' · Sin siguiente acción'),changes:[]});
}
function approve(data,id,{at,actor,expectedVersion}){
 const d=data.documents.find(d=>d.id===id);if(!d)throw Error('El documento ya no existe.');const p=data.projects.find(p=>p.id===d.projectId);if(!p)throw Error('El proyecto ya no existe.');if((p.updatedAt||'')!==expectedVersion)throw Error('El proyecto cambió. Revisá sus documentos.');
 for(const other of data.documents)if(other.id!==d.id&&other.projectId===d.projectId&&other.type===d.type&&other.current===true){other.current=false;other.status='Histórico';}
 d.current=true;d.status='Aprobado';d.approvedAt=at;d.approvedBy=actor;p.updatedAt=at;p.followUpLog=p.followUpLog||[];p.followUpLog.push({id:'doc:'+id+':'+at,at,actor,note:'Documento aprobado y vigente: '+d.title+' · '+(d.revision||'Sin revisión'),changes:[]});
}
const api={complete,approve};if(typeof module!=='undefined')module.exports=api;else root.TBDailyActionsCore=api;
})(typeof window==='undefined'?globalThis:window);
