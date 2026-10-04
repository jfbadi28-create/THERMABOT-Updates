/* Shared workflow rules. No changes to HVAC equations. */
(function(root){
  'use strict';
  const active=p=>!['Finalizado','Suspendido'].includes(p.status);
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function search(tracker,balances,query){
    const q=fold(query).trim();
    const project=id=>tracker.projects.find(p=>p.id===id)?.name||'Sin proyecto';
    const rows=[...tracker.projects.map(p=>({kind:'Proyecto',id:p.id,projectId:p.id,title:p.name,detail:[p.establishment,p.sector,p.system].filter(Boolean).join(' · ')})),
      ...tracker.equipment.map(e=>({kind:'Equipo',id:e.id,projectId:e.projectId,title:e.name,detail:[project(e.projectId),e.model,e.tag].filter(Boolean).join(' · ')})),
      ...tracker.documents.map(d=>({kind:'Documento',id:d.id,projectId:d.projectId,title:d.title,detail:[project(d.projectId),d.type,d.revision].join(' · ')})),
      ...tracker.milestones.map(m=>({kind:'Hito',id:m.id,projectId:m.projectId,title:m.title,detail:project(m.projectId)})),
      ...tracker.projects.filter(p=>active(p)&&p.nextAction).map(p=>({kind:'Tarea',id:'next:'+p.id,projectId:p.id,title:p.nextAction,detail:[p.name,p.owner].filter(Boolean).join(' · ')})),
      ...balances.map(b=>({kind:'Cálculo',id:b.id,title:b.nombre,detail:b.condiciones?.ciudad||''}))];
    return rows.filter(r=>!q||fold(r.title+' '+r.detail+' '+r.kind).includes(q)).slice(0,40);
  }
  function tasks(tracker,today,workflow={}){
    const projects=tracker.projects.filter(active),ids=new Set(projects.map(p=>p.id));
    return [...tracker.milestones.filter(m=>ids.has(m.projectId)).map(m=>({...m,kind:'milestone',project:projects.find(p=>p.id===m.projectId)?.name})),
      ...projects.filter(p=>p.nextAction).map(p=>({id:'next:'+p.id,projectId:p.id,title:p.nextAction,project:p.name,status:workflow[p.id]?.nextTaskStatus||'Pendiente',dueDate:p.nextDueDate===undefined?p.targetDate:p.nextDueDate,owner:p.owner,kind:'next'}))]
      .map(t=>({...t,overdue:!!t.dueDate&&t.dueDate<today&&t.status!=='Cumplido'}))
      .sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  }
  function projectLane(p){if(p.status==='Finalizado')return 'Finalizado';if(p.status==='Esperando tercero')return 'Esperando tercero';if(['Bloqueado','Urgente'].includes(p.status))return 'Bloqueado';if(p.status==='Suspendido')return 'Suspendido';return 'Activo';}
  function financial(finance={}){
    const lines=finance.lines||[];
    const total=type=>lines.filter(l=>l.type===type).reduce((s,l)=>s+Math.max(0,Number(l.quantity)||0)*Math.max(0,Number(l.unitPrice)||0),0);
    const quoted=total('Presupuesto'),cost=total('Costo'),revenue=total('Ingreso');
    return {quoted,cost,revenue,profit:revenue-cost,margin:revenue>0?(revenue-cost)/revenue*100:null,pendingPrices:lines.filter(l=>l.needsPrice).length};
  }
  function marketing(tracker,meta){
    const quoted=tracker.projects.filter(p=>meta[p.id]?.quotedAt||p.stage==='Cotización');
    const resolved=quoted.filter(p=>['Ganada','Perdida'].includes(meta[p.id]?.quoteOutcome));
    const won=resolved.filter(p=>meta[p.id]?.quoteOutcome==='Ganada');
    const groups={};
    tracker.projects.forEach(p=>{const name=p.system||'Sin clasificar',f=financial(meta[p.id]?.finance);const g=groups[name]||{name,revenue:0,cost:0};g.revenue+=f.revenue;g.cost+=f.cost;groups[name]=g;});
    return {quoted:quoted.length,resolved:resolved.length,won:won.length,conversion:resolved.length?won.length/resolved.length*100:null,groups:Object.values(groups).map(g=>({...g,profit:g.revenue-g.cost}))};
  }
  function publicSnapshot(p,tracker){
    // Client output intentionally excludes internal notes, blockers, costs and document URLs.
    return {name:p.name,establishment:p.establishment,status:p.status,stage:p.stage,progress:p.progress,
      milestones:tracker.milestones.filter(m=>m.projectId===p.id).map(m=>({title:m.title,status:m.status,dueDate:m.dueDate||''}))};
  }
  function previewUrl(value){
    try{const u=new URL(value);if(u.protocol!=='https:')return null;
      if(u.hostname==='drive.google.com'){const id=u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');return id&&/^[\w-]+$/.test(id)?'https://drive.google.com/file/d/'+id+'/preview':null;}
      if(u.pathname.toLowerCase().endsWith('.pdf'))return u.href;
    }catch{}return null;
  }
  const api={active,search,tasks,projectLane,financial,marketing,publicSnapshot,previewUrl};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBSuiteCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
