/* Vista "Hoy": consulta rápida para celulares y tablets en modo solo lectura. No edita datos. */
(function(){
  'use strict';
  const C=window.TBSuiteCore,API=window.TBTracker,$=id=>document.getElementById(id);
  if(!C||!API||!$('todayView'))return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Buenos_Aires'});
  const day=d=>d?d.split('-').reverse().slice(0,2).join('/'):'Sin fecha';
  const active=p=>!['Finalizado','Suspendido'].includes(p.status);
  function workflow(){try{return JSON.parse(localStorage.getItem('thermabot.suite.v1')||'{}').projects||{};}catch{return {};}}
  function longDate(){return new Date().toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',weekday:'long',day:'numeric',month:'long'});}
  function taskRow(t){
    return '<button class="today-item'+(t.overdue?' is-overdue':'')+'" data-today-project="'+esc(t.projectId)+'"><span class="today-date">'+esc(day(t.dueDate))+'</span><span class="today-copy"><b>'+esc(t.title)+'</b><small>'+esc(t.project||'')+'</small></span></button>';
  }
  function projectCard(p){
    const tr=p.installedTR!==undefined&&p.installedTR!==null&&p.installedTR!==''&&Number.isFinite(Number(p.installedTR))?'<span class="today-tag">'+esc(p.installedTR)+' TR</span>':'';
    const next=String(p.nextAction||'').trim();
    return '<button class="today-project" data-today-project="'+esc(p.id)+'"><span class="today-project-head"><b>'+esc(p.name)+'</b>'+tr+'</span><small>'+esc([p.establishment,p.stage,p.status].filter(Boolean).join(' · '))+'</small>'+(next?'<span class="today-next"><i>Próximo paso</i>'+esc(next)+(p.nextDueDate?' · '+esc(day(p.nextDueDate)):'')+'</span>':'<span class="today-next muted">Sin próximo paso registrado</span>')+'</button>';
  }
  function section(title,count,body,empty){
    return '<section class="today-section"><h3>'+esc(title)+(count?' <span>'+count+'</span>':'')+'</h3>'+(body||'<p class="today-empty">'+esc(empty)+'</p>')+'</section>';
  }
  function render(){
    if(API.view()!=='today')return;
    const data=API.snapshot(),q=C.dailyQueue(data,today(),workflow());
    const projects=data.projects.filter(active).sort((a,b)=>(a.nextDueDate||'9999').localeCompare(b.nextDueDate||'9999')||String(a.name).localeCompare(String(b.name)));
    const viewer=window.TBCloud?.mode?.()==='viewer';
    $('todayView').innerHTML='<header class="today-head"><p>'+esc(longDate())+'</p>'+(viewer?'<small>Solo consulta · los datos vienen de Drive</small>':'')+'</header>'
      +'<div class="today-counts"><span class="'+(q.overdue.length?'risk':'')+'"><b>'+q.overdue.length+'</b>vencidas</span><span><b>'+q.week.length+'</b>esta semana</span><span><b>'+projects.length+'</b>proyectos activos</span></div>'
      +section('Atrasado',q.overdue.length,q.overdue.map(taskRow).join(''),'Nada vencido.')
      +section('Próximos 7 días',q.week.length,q.week.filter(t=>!t.overdue).map(taskRow).join(''),'Sin vencimientos esta semana.')
      +section('Proyectos activos',projects.length,projects.map(projectCard).join(''),'No hay proyectos activos.');
    document.querySelectorAll('[data-today-project]').forEach(b=>b.onclick=()=>API.select(b.dataset.todayProject));
  }
  for(const e of ['thermabot:view','thermabot:data','thermabot:render'])window.addEventListener(e,render);
  render();
})();
