/* Operational metrics. These rules never change HVAC equations. */
(function(root){
  'use strict';
  const completedDay=f=>f.completedOn||(f.completedAt&&Number.isFinite(new Date(f.completedAt).getTime())?new Date(f.completedAt).toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'}):'');
  const open=r=>!['Cerrado','Resuelto','Aprobado','Cancelado'].includes(r.status);
  const day=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?d:null;};
  function week(today){const d=day(today);if(!d)return '';d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
  function metrics(data,tasks,workflow,today,projectId=''){
    const projects=data.projects.filter(p=>!projectId||p.id===projectId),ids=new Set(projects.map(p=>p.id));
    const active=projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status));
    const scoped=tasks.filter(t=>ids.has(t.projectId)),pending=scoped.filter(t=>t.status!=='Cumplido');
    const records=projects.flatMap(p=>(workflow[p.id]?.controls||[]).map(r=>({...r,projectId:p.id,project:p.name})));
    const restrictions=records.filter(r=>r.kind==='Restricción'&&open(r));
    const inherited=active.filter(p=>p.blocker?.trim()).map(p=>({id:'legacy:'+p.id,title:p.blocker,kind:'Restricción',projectId:p.id,project:p.name,status:'Abierto',source:'Ficha del proyecto'}));
    const risks=records.filter(r=>r.kind==='Riesgo'&&open(r));
    const changes=records.filter(r=>r.kind==='Cambio'&&open(r));
    const deliverables=[...data.documents.filter(d=>ids.has(d.projectId)&&d.status!=='Reemplazado'),...records.filter(r=>r.kind==='Entregable'&&r.status!=='Cancelado')];
    const waiting=active.filter(p=>p.status==='Esperando tercero');
    const waitDays=waiting.map(p=>workflow[p.id]?.waitingSince).filter(v=>day(v)&&v<=today).map(v=>Math.round((day(today)-day(v))/86400000));
    const facts=projects.flatMap(p=>Object.values(workflow[p.id]?.taskFacts||{}));
    const committed=facts.filter(f=>f.committedWeek===week(today));
    const done=committed.filter(f=>completedDay(f)&&completedDay(f)<=today&&completedDay(f)>=f.committedWeek&&f.dueDate&&completedDay(f)<=f.dueDate);
    const wip=pending.filter(t=>t.status==='En curso');
    const dated=active.filter(p=>Number.isFinite(Number(p.progress))&&p.progress!==''&&p.progress!=null);
    const upcoming=data.milestones.filter(m=>ids.has(m.projectId)&&m.status!=='Cumplido'&&day(m.dueDate)&&m.dueDate>=today&&(day(m.dueDate)-day(today))/86400000<=21).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    const overdue=pending.filter(t=>t.dueDate&&t.dueDate<today);
    const critical=active.some(p=>['Urgente','Bloqueado'].includes(p.status))||risks.some(r=>r.severity==='Alta');
    const health=!projects.length?'Sin datos':critical?'Crítica':overdue.length||restrictions.length||inherited.length?'En riesgo':waiting.length?'En espera':'Estable';
    return {active:active.length,pending:pending.length,overdue:overdue.length,waiting:waiting.length,waitAverage:waitDays.length?waitDays.reduce((a,b)=>a+b,0)/waitDays.length:null,waitCoverage:waitDays.length,progress:dated.length?dated.reduce((s,p)=>s+Math.max(0,Math.min(100,Number(p.progress))),0)/dated.length:null,restrictions:restrictions.length+inherited.length,risks:risks.length,changes:changes.length,approved:deliverables.filter(r=>r.status==='Aprobado').length,deliverables:deliverables.length,ppc:committed.length?done.length/committed.length*100:null,committed:committed.length,fulfilled:done.length,wip:wip.length,upcoming,health,records,issues:[...restrictions,...inherited,...risks,...changes]};
  }
  const api={metrics,week,open};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBEngineering=api;
})(typeof globalThis!=='undefined'?globalThis:this);
