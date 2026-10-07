(() => {
  'use strict';

  if(location.hostname.endsWith('github.io')){
    const target='https://thermabot-updates.pages.dev'+location.pathname.replace('/THERMABOT-Updates','')+location.search+location.hash;
    location.replace(target);
    return;
  }

  const STORAGE_KEY = 'thermabot.tracker.v1';
  const DRIVE_CLIENT_KEY = 'thermabot.drive.client_id';
  const DRIVE_IDS_KEY = 'thermabot.drive.ids.v1';
  const BALANCE_STORAGE_KEY = 'thermabot.proyectos.v1';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const ROOT_FOLDER_NAME = 'THERMABOT';
  const TRACKER_FOLDER_NAME = 'Seguimiento';
  const TRACKER_FILE_NAME = 'seguimiento-proyectos.json';

  const STAGES = ['Idea','Relevamiento','Anteproyecto','Ingeniería','Pliego','Cotización','Contratación','Adjudicado','Obra','Puesta en marcha','Validación','Cerrado'];
  const STATUSES = ['Activo','Esperando tercero','Bloqueado','En revisión','Urgente','Finalizado','Suspendido'];
  const PRIORITIES = ['Urgente','Alta','Media','Baja'];
  const EQUIPMENT_STATUSES = ['A definir','Cotización','Pedido','En instalación','En servicio','Mantenimiento','Fuera de servicio'];
  const MILESTONE_STATUSES = ['Pendiente','En curso','Esperando respuesta','Cumplido','Vencido'];
  const MILESTONE_TYPES = ['Ingeniería','Pliego','Compra','Licitación','Obra','Puesta en marcha','Validación','Administrativo','Otro'];
  const DOCUMENT_TYPES = ['Pliego','Plano','Memoria','Informe','Cotización','Acta','Certificación','Protocolo','Manual','Otro'];
  const DOCUMENT_STATUSES = ['Borrador','En revisión','Vigente','Reemplazado','Aprobado'];

  const $ = id => document.getElementById(id);
  const n = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const clamp = (v,min,max) => Math.max(min, Math.min(max, n(v,min)));
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const today = () => new Date().toISOString().slice(0,10);
  const nowIso = () => new Date().toISOString();
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const slug = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const dateLabel = value => {
    if(!value) return '—';
    const d = new Date(`${value}T12:00:00`);
    if(Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
  };
  const relativeDue = value => {
    if(!value) return null;
    const d = new Date(`${value}T12:00:00`);
    const t = new Date(); t.setHours(12,0,0,0);
    return Math.round((d-t)/86400000);
  };
  const optionList = (items,current='') => items.map(x => `<option value="${esc(x)}" ${x===current?'selected':''}>${esc(x)}</option>`).join('');
  const emptyRow = (cols,text='Sin registros') => `<tr><td colspan="${cols}" class="empty-table">${esc(text)}</td></tr>`;

  function blankState(){
    return {schemaVersion:1, updatedAt:nowIso(), projects:[], equipment:[], milestones:[], documents:[]};
  }

  function normalizeState(raw){
    const base = blankState();
    if(!raw || typeof raw !== 'object') return base;
    return {
      schemaVersion:1,
      updatedAt:raw.updatedAt || nowIso(),
      projects:Array.isArray(raw.projects)?raw.projects:[],
      equipment:Array.isArray(raw.equipment)?raw.equipment:[],
      milestones:Array.isArray(raw.milestones)?raw.milestones:[],
      documents:Array.isArray(raw.documents)?raw.documents:[]
    };
  }

  function loadLocal(){
    try{return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}
    catch{return blankState();}
  }

  let data = loadLocal();
  let view = 'dashboard';
  let navigationReady=false;
  let selectedProjectId = data.projects[0]?.id || null;
  let filters = {establishment:'',sector:'',system:'',stage:''};
  let driveSaveTimer = null;
  const drive = {token:null, connected:false, rootId:null, folderId:null, fileId:null, folderLink:null, lastSync:null, syncing:false};

  function projectById(id){return data.projects.find(p=>p.id===id)||null;}
  function projectName(id){return projectById(id)?.name || 'Sin proyecto';}
  function selectedProject(){return projectById(selectedProjectId);}

  function saveLocal({touch=true, sync=true}={}){
    if(touch) data.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event('thermabot:data'));
    $('trackerSaveStatus').textContent = `Guardado local · ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
    if(sync && drive.connected) scheduleDriveSave();
  }

  function scheduleDriveSave(){
    clearTimeout(driveSaveTimer);
    driveSaveTimer = setTimeout(()=>pushDrive(false).catch(err=>setDriveMessage(err.message,'error')),1400);
  }

  function setView(next,{replace=false}={}){
    if(['marketing'].includes(next))next='dashboard';
    if(next==='agenda')next='dashboard';
    if(next==='dashboard')next='projects';
    if(['milestones','documents'].includes(next)){
      document.body.dataset.projectTab=next==='milestones'?'Hitos':'Documentos';
      window.dispatchEvent(new CustomEvent('thermabot:projecttab',{detail:document.body.dataset.projectTab}));
      next='project';
    }
    view = next;
    document.body.dataset.module=next;
    if(next==='calculator'||next==='pressure'||next==='water'){
      const requested=new URLSearchParams(location.search).get('balanceId');
      let linked=selectedProject()?.sourceBalanceId;
      try{const links=JSON.parse(localStorage.getItem('thermabot.workspace.v1')||'{}').links||{};linked=Object.keys(links).find(id=>links[id]===selectedProjectId)||linked;}catch{}
      const frame=document.querySelector('#view-'+next+' iframe');
      const balanceId=requested||linked;
      const target=(next==='water'?'water/index.html':next==='calculator'?'quadri/index.html':'pressure.html')+'?embedded=1&projectId='+encodeURIComponent(selectedProjectId||'')+(next==='water'?(new URLSearchParams(location.search).get('waterId')?'&waterId='+encodeURIComponent(new URLSearchParams(location.search).get('waterId')):''):(balanceId?'&balanceId='+encodeURIComponent(balanceId):''));
      if(frame && frame.getAttribute('src')!==target){frame.classList.remove('is-ready');frame.src=target;}if(frame&&!frame.dataset.loadReady){frame.dataset.loadReady='1';frame.addEventListener('load',()=>requestAnimationFrame(()=>frame.classList.add('is-ready')));}
    }
    const destination='tracker.html?view='+encodeURIComponent(next)+(selectedProjectId?'&projectId='+encodeURIComponent(selectedProjectId):'');
    if(location.pathname.split('/').pop()+location.search!==destination)history[replace||!navigationReady?'replaceState':'pushState'](null,'',destination);
    window.dispatchEvent(new Event('thermabot:view'));
    document.querySelectorAll('[data-view="'+next+'"]').forEach(b=>b.classList.add('active'));
    document.querySelectorAll('.tracker-view').forEach(el=>el.classList.toggle('active-view',el.id===`view-${view}`));
    document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',(el.dataset.view===view||el.dataset.view==='balances'&&['calculator','water','audits'].includes(view)));if((el.dataset.view===view||el.dataset.view==='balances'&&['calculator','water','audits'].includes(view)))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    const titles = {tasks:'Tareas',project:'Espacio del proyecto',activity:'Actividad',marketing:'Resultados y marketing',settings:'Configuración',calculator:'Balance térmico',water:'Agua · dos caños',pressure:'Presurización',balances:'Cálculos',audits:'Revisión de ingeniería',backup:'Respaldo de cálculos',dashboard:'Centro de comando',projects:'Proyectos',equipment:'Equipos',milestones:'Hitos',documents:'Documentos',drive:'Google Drive'};
    $('trackerTitle').textContent=titles[view]||'Seguimiento de proyectos';
    const topWord=$('topWordReportBtn');if(topWord)topWord.hidden=view!=='projects';
    if(view==='drive') renderDrive();
    window.dispatchEvent(new Event('thermabot:navigate'));
  }

  function filteredProjects(){
    return data.projects.filter(p =>
      (!filters.establishment || p.establishment===filters.establishment) &&
      (!filters.sector || p.sector===filters.sector) &&
      (!filters.system || p.system===filters.system) &&
      (!filters.stage || p.stage===filters.stage)
    );
  }

  function updateFilterOptions(){
    const unique = key => [...new Set(data.projects.map(p=>p[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const configs = [
      ['filterEstablishment','establishment',unique('establishment')],
      ['filterSector','sector',unique('sector')],
      ['filterSystem','system',unique('system')],
      ['filterStage','stage',STAGES]
    ];
    configs.forEach(([id,key,items])=>{
      const el=$(id), current=filters[key];
      el.innerHTML=`<option value="">${key==='stage'?'Todas':'Todos'}</option>`+items.map(x=>`<option ${x===current?'selected':''}>${esc(x)}</option>`).join('');
      el.value=current;
    });
  }

  function statusBadge(status){return `<span class="status-badge ${slug(status)}">${esc(status||'—')}</span>`;}
  function priorityBadge(priority){return `<span class="priority-badge ${slug(priority)}">${esc(priority||'—')}</span>`;}
  function progressCell(value){const v=clamp(value,0,100);return `<div class="progress-mini"><b>${v}%</b><div class="progress-track"><i style="width:${v}%"></i></div></div>`;}

  function renderDashboard(){
    updateFilterOptions();
    const projects=filteredProjects();
    const nonFinished=projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status));
    const active=projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status)).length;
    const waiting=projects.filter(p=>p.status==='Esperando tercero').length;
    const risk=projects.filter(p=>['Bloqueado','Urgente'].includes(p.status)).length;
    const progress=nonFinished.length ? Math.round(nonFinished.reduce((s,p)=>s+clamp(p.progress,0,100),0)/nonFinished.length) : 0;
    const upcoming=data.milestones.filter(m=>{const d=relativeDue(m.dueDate);return d!==null&&d>=0&&d<=14&&m.status!=='Cumplido';});
    const equipmentProjectIds=new Set(projects.map(p=>p.id));
    const eqCount=data.equipment.filter(e=>equipmentProjectIds.has(e.projectId)).length;
    $('kpiActive').textContent=active;
    $('kpiActiveNote').textContent=`${projects.length} en el filtro actual`;
    $('kpiWaiting').textContent=waiting;
    $('kpiRisk').textContent=risk;
    $('kpiProgress').textContent=`${progress}%`;
    $('kpiMilestones').textContent=upcoming.length;
    $('kpiEquipment').textContent=eqCount;

    const sorted=[...projects].sort((a,b)=>{
      const riskScore=s=>s==='Urgente'?0:s==='Bloqueado'?1:s==='Esperando tercero'?2:3;
      return riskScore(a.status)-riskScore(b.status) || (a.targetDate||'9999').localeCompare(b.targetDate||'9999');
    });
    $('dashboardProjectsBody').innerHTML=sorted.length?sorted.slice(0,12).map(p=>`<tr data-id="${p.id}" class="${p.id===selectedProjectId?'selected':''}"><td><strong>${esc(p.name)}</strong><br><span class="muted-cell">${esc(p.establishment||'—')}</span></td><td>${esc(p.stage||'—')}</td><td>${statusBadge(p.status)}</td><td>${progressCell(p.progress)}</td><td>${esc(p.nextAction||'—')}</td></tr>`).join(''):emptyRow(5,'Todavía no hay proyectos en el seguimiento.');

    const milestoneList=[...data.milestones].filter(m=>m.status!=='Cumplido').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).slice(0,8);
    $('dashboardMilestones').innerHTML=milestoneList.length?milestoneList.map(m=>{const due=relativeDue(m.dueDate);return `<div class="timeline-item ${due!==null&&due<0?'overdue':''}"><time>${dateLabel(m.dueDate)}</time><strong>${esc(m.title)}</strong><span>${esc(projectName(m.projectId))} · ${esc(m.status)}</span></div>`;}).join(''):'<div class="empty-summary">Sin hitos pendientes.</div>';

    const attention=projects.filter(p=>['Esperando tercero','Bloqueado','Urgente'].includes(p.status));
    $('attentionList').innerHTML=attention.length?attention.map(p=>`<div class="attention-item ${['Bloqueado','Urgente'].includes(p.status)?'risk':''}" data-project="${p.id}"><strong>${esc(p.name)}</strong><span>${statusBadge(p.status)} · ${esc(p.stage||'—')}</span><span><b>Próxima acción:</b> ${esc(p.nextAction||'Sin definir')}</span><span><b>Bloqueo:</b> ${esc(p.blocker||'—')}</span></div>`).join(''):'<div class="empty-summary">No hay esperas ni bloqueos en el filtro actual.</div>';
    bindProjectRows();
    document.querySelectorAll('[data-project]').forEach(el=>el.onclick=()=>selectProject(el.dataset.project));
  }

  function renderProjects(){
    const q=($('projectSearch').value||'').trim().toLowerCase();
    const list=data.projects.filter(p=>!q||[p.establishment,p.name,p.sector,p.system,p.stage,p.status,p.expediente].join(' ').toLowerCase().includes(q));
    $('projectsBody').innerHTML=list.length?list.map(p=>`<tr data-id="${p.id}" class="${p.id===selectedProjectId?'selected':''}"><td>${esc(p.establishment||'—')}</td><td><strong>${esc(p.name)}</strong></td><td>${esc(p.sector||'—')}</td><td>${esc(p.system||'—')}</td><td>${priorityBadge(p.priority)}</td><td>${esc(p.stage||'—')}</td><td>${statusBadge(p.status)}</td><td>${progressCell(p.progress)}</td><td>${dateLabel(p.targetDate)}</td></tr>`).join(''):emptyRow(9,'No hay proyectos.');
    bindProjectRows();
    window.dispatchEvent(new Event('thermabot:portfolio'));
  }

  function renderEquipment(){
    $('equipmentBody').innerHTML=data.equipment.length?data.equipment.map(e=>`<tr><td>${esc(projectName(e.projectId))}</td><td><strong>${esc(e.name)}</strong></td><td>${esc(e.model||'—')}</td><td>${esc(e.location||'—')}</td><td>${statusBadge(e.status)}</td><td>${esc(e.supplier||'—')}</td><td class="row-actions"><button class="icon-btn" data-edit-equipment="${e.id}">Editar</button><button class="icon-btn" data-del-equipment="${e.id}">×</button></td></tr>`).join(''):emptyRow(7,'No hay equipos registrados.');
    document.querySelectorAll('[data-edit-equipment]').forEach(b=>b.onclick=()=>openEquipmentModal(b.dataset.editEquipment));
    document.querySelectorAll('[data-del-equipment]').forEach(b=>b.onclick=()=>deleteItem('equipment',b.dataset.delEquipment));
  }

  function renderMilestones(){
    const list=[...data.milestones].sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    $('milestonesBody').innerHTML=list.length?list.map(m=>`<tr><td>${dateLabel(m.dueDate)}</td><td>${esc(projectName(m.projectId))}</td><td><strong>${esc(m.title)}</strong></td><td>${esc(m.type||'—')}</td><td>${statusBadge(m.status)}</td><td>${esc(m.owner||'—')}</td><td class="row-actions"><button class="icon-btn" data-edit-milestone="${m.id}">Editar</button><button class="icon-btn" data-del-milestone="${m.id}">×</button></td></tr>`).join(''):emptyRow(7,'No hay hitos registrados.');
    document.querySelectorAll('[data-edit-milestone]').forEach(b=>b.onclick=()=>openMilestoneModal(b.dataset.editMilestone));
    document.querySelectorAll('[data-del-milestone]').forEach(b=>b.onclick=()=>deleteItem('milestones',b.dataset.delMilestone));
  }

  function renderDocuments(){
    const list=[...data.documents].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    $('documentsBody').innerHTML=list.length?list.map(d=>`<tr><td>${esc(projectName(d.projectId))}</td><td>${esc(d.type||'—')}</td><td><strong>${esc(d.title)}</strong></td><td>${esc(d.revision||'—')}</td><td>${statusBadge(d.status)}</td><td>${dateLabel((d.updatedAt||'').slice(0,10))}</td><td class="link-cell">${d.driveUrl?`<a href="${esc(d.driveUrl)}" target="_blank" rel="noopener">Abrir</a>`:'—'}</td><td class="row-actions"><button class="icon-btn" data-edit-document="${d.id}">Editar</button><button class="icon-btn" data-del-document="${d.id}">×</button></td></tr>`).join(''):emptyRow(8,'No hay documentos registrados.');
    document.querySelectorAll('[data-edit-document]').forEach(b=>b.onclick=()=>openDocumentModal(b.dataset.editDocument));
    document.querySelectorAll('[data-del-document]').forEach(b=>b.onclick=()=>deleteItem('documents',b.dataset.delDocument));
  }

  function renderSummary(){
    const p=selectedProject();
    $('selectedProjectEmpty').classList.toggle('hidden',!!p);
    $('selectedProjectPanel').classList.toggle('hidden',!p);
    $('selectedProjectName').textContent=p?.name||'Sin proyecto';
    $('selectedProjectMeta').textContent=p?`${p.establishment||'Sin establecimiento'} · ${p.sector||'Sin sector'} · ${p.system||'Sin sistema'}`:'Seleccioná un proyecto de la tabla.';
    if(!p) return;
    const prog=clamp(p.progress,0,100);
    $('selectedProgressText').textContent=`${prog}%`;
    $('selectedProgressBar').style.width=`${prog}%`;
    $('quickStatus').innerHTML=optionList(STATUSES,p.status);
    $('quickStage').innerHTML=optionList(STAGES,p.stage);
    $('quickProgress').value=prog;
    $('quickTargetDate').value=p.targetDate||'';
    $('quickNextAction').value=p.nextAction||'';
    $('quickBlocker').value=p.blocker||'';
    $('selectedLastMove').textContent=p.lastMove||'—';
    $('selectedExpediente').textContent=p.expediente||'—';
    $('selectedSpec').textContent=p.specRevision||'—';
    $('selectedDrawing').textContent=p.drawingRevision||'—';
  }

  function renderAll(){
    renderDashboard(); renderProjects(); renderEquipment(); renderMilestones(); renderDocuments(); renderSummary(); renderDrive();
    window.dispatchEvent(new Event('thermabot:render'));
    $('trackerMeta').textContent=`${data.projects.length} proyectos · ${data.milestones.filter(m=>m.status!=='Cumplido').length} hitos abiertos · ${data.documents.length} documentos`;
  }

  function bindProjectRows(){
    document.querySelectorAll('tr[data-id]').forEach(row=>row.onclick=()=>selectProject(row.dataset.id));
  }

  function selectProject(id){
    selectedProjectId=id;
    renderAll();
    setView('project');
  }

  function modal(title,html){
    $('trackerModalTitle').textContent=title;
    $('trackerModalBody').innerHTML=html;
    $('trackerModal').classList.remove('hidden');
  }
  function closeModal(){$('trackerModal').classList.add('hidden');}

  function projectFormHtml(p={}){
    return `<form id="projectForm" class="modal-grid">
      <input type="hidden" name="id" value="${esc(p.id||'')}" />
      <label>Establecimiento<input name="establishment" value="${esc(p.establishment||'')}" required /></label>
      <label>Proyecto<input name="name" value="${esc(p.name||'')}" required /></label>
      <label>Sector<input name="sector" value="${esc(p.sector||'')}" /></label>
      <label>Sistema HVAC<input name="system" value="${esc(p.system||'')}" placeholder="VRF, UTA, Chiller, extracción…" /></label>
      <label>Prioridad<select name="priority">${optionList(PRIORITIES,p.priority||'Media')}</select></label>
      <label>Etapa<select name="stage">${optionList(STAGES,p.stage||'Idea')}</select></label>
      <label>Estado<select name="status">${optionList(STATUSES,p.status||'Activo')}</select></label>
      <label>Avance [%]<input name="progress" type="number" min="0" max="100" step="5" value="${clamp(p.progress||0,0,100)}" /></label>
      <label>Responsable<input name="owner" value="${esc(p.owner||'')}" /></label>
      <label>Fecha objetivo<input name="targetDate" type="date" value="${esc(p.targetDate||'')}" /></label>
      <label>Último movimiento<input name="lastMove" value="${esc(p.lastMove||'')}" placeholder="Ej.: proveedor envió propuesta" /></label>
      <label>Próxima acción<input name="nextAction" value="${esc(p.nextAction||'')}" /></label>
      <label class="span-2">Bloqueo / esperando tercero<input name="blocker" value="${esc(p.blocker||'')}" /></label>
      <label>Pliego vigente<input name="specRevision" value="${esc(p.specRevision||'')}" placeholder="R00 / R01 / pendiente" /></label>
      <label>Plano vigente<input name="drawingRevision" value="${esc(p.drawingRevision||'')}" placeholder="R00 / R01 / pendiente" /></label>
      <label>Proveedor / contratista<input name="supplier" value="${esc(p.supplier||'')}" /></label>
      <label>Expediente / referencia<input name="expediente" value="${esc(p.expediente||'')}" /></label>
      <label class="span-2">Observaciones<textarea name="notes" rows="3">${esc(p.notes||'')}</textarea></label>
      <div class="modal-actions span-2"><button type="button" class="pill" data-close-modal>Cancelar</button><button type="submit" class="pill dark">Guardar proyecto</button></div>
    </form>`;
  }

  function openProjectModal(id=null){
    const p=id?projectById(id):{};
    modal(id?'Editar proyecto':'Nuevo proyecto',projectFormHtml(p));
    document.querySelector('[data-close-modal]').onclick=closeModal;
    $('projectForm').onsubmit=e=>{
      e.preventDefault(); const f=new FormData(e.currentTarget); const obj=Object.fromEntries(f.entries());
      obj.progress=clamp(obj.progress,0,100); obj.updatedAt=nowIso();
      if(obj.id){
        const ix=data.projects.findIndex(x=>x.id===obj.id); if(ix>=0) data.projects[ix]={...data.projects[ix],...obj};
      }else{
        obj.id=uid('prj'); obj.createdAt=nowIso(); obj.sourceBalanceId=null; data.projects.unshift(obj); selectedProjectId=obj.id;
      }
      saveLocal(); closeModal(); renderAll();
    };
  }

  function projectSelectOptions(current=''){
    return `<option value="">Sin proyecto</option>`+data.projects.map(p=>`<option value="${p.id}" ${p.id===current?'selected':''}>${esc(p.name)}</option>`).join('');
  }

  function openEquipmentModal(id=null){
    const e=id?data.equipment.find(x=>x.id===id):{projectId:selectedProjectId};
    modal(id?'Editar equipo':'Nuevo equipo',`<form id="equipmentForm" class="modal-grid"><input type="hidden" name="id" value="${esc(e?.id||'')}"/><label>Proyecto<select name="projectId">${projectSelectOptions(e?.projectId)}</select></label><label>Equipo<input name="name" required value="${esc(e?.name||'')}" placeholder="UTA 01 / Chiller / VRF…"/></label><label>Modelo<input name="model" value="${esc(e?.model||'')}"/></label><label>Capacidad / dato clave<input name="capacity" value="${esc(e?.capacity||'')}" placeholder="37 TR / 10.700 m³/h"/></label><label>Ubicación<input name="location" value="${esc(e?.location||'')}"/></label><label>Estado<select name="status">${optionList(EQUIPMENT_STATUSES,e?.status||'A definir')}</select></label><label>Proveedor<input name="supplier" value="${esc(e?.supplier||'')}"/></label><label>Identificación / serie<input name="tag" value="${esc(e?.tag||'')}"/></label><label class="span-2">Observaciones<textarea name="notes" rows="3">${esc(e?.notes||'')}</textarea></label><div class="modal-actions span-2"><button type="button" class="pill" data-close-modal>Cancelar</button><button type="submit" class="pill dark">Guardar equipo</button></div></form>`);
    document.querySelector('[data-close-modal]').onclick=closeModal;
    $('equipmentForm').onsubmit=e2=>{e2.preventDefault();const o=Object.fromEntries(new FormData(e2.currentTarget).entries());if(o.id){const ix=data.equipment.findIndex(x=>x.id===o.id);data.equipment[ix]={...data.equipment[ix],...o};}else{o.id=uid('eq');data.equipment.push(o);}saveLocal();closeModal();renderAll();};
  }

  function openMilestoneModal(id=null){
    const m=id?data.milestones.find(x=>x.id===id):{};
    modal(id?'Editar hito':'Nuevo hito',`<form id="milestoneForm" class="modal-grid"><input type="hidden" name="id" value="${esc(m?.id||'')}"/><label>Proyecto<select name="projectId">${projectSelectOptions(m?.projectId||selectedProjectId||'')}</select></label><label>Hito<input name="title" required value="${esc(m?.title||'')}"/></label><label>Tipo<select name="type">${optionList(MILESTONE_TYPES,m?.type||'Ingeniería')}</select></label><label>Fecha objetivo<input name="dueDate" type="date" value="${esc(m?.dueDate||'')}"/></label><label>Estado<select name="status">${optionList(MILESTONE_STATUSES,m?.status||'Pendiente')}</select></label><label>Responsable<input name="owner" value="${esc(m?.owner||'')}"/></label><label class="span-2">Observaciones<textarea name="notes" rows="3">${esc(m?.notes||'')}</textarea></label><div class="modal-actions span-2"><button type="button" class="pill" data-close-modal>Cancelar</button><button type="submit" class="pill dark">Guardar hito</button></div></form>`);
    document.querySelector('[data-close-modal]').onclick=closeModal;
    $('milestoneForm').onsubmit=e2=>{e2.preventDefault();const o=Object.fromEntries(new FormData(e2.currentTarget).entries()),old=data.milestones.find(x=>x.id===o.id);o.completedAt=o.status==='Cumplido'?(old?.status==='Cumplido'?old.completedAt||null:nowIso()):null;if(o.id){const ix=data.milestones.findIndex(x=>x.id===o.id);data.milestones[ix]={...data.milestones[ix],...o};}else{o.id=uid('hit');o.createdAt=nowIso();data.milestones.push(o);}saveLocal();closeModal();renderAll();};
  }

  function openDocumentModal(id=null){
    const d=id?data.documents.find(x=>x.id===id):{};
    modal(id?'Editar documento':'Nuevo documento',`<form id="documentForm" class="modal-grid"><input type="hidden" name="id" value="${esc(d?.id||'')}"/><label>Proyecto<select name="projectId">${projectSelectOptions(d?.projectId||selectedProjectId||'')}</select></label><label>Tipo<select name="type">${optionList(DOCUMENT_TYPES,d?.type||'Pliego')}</select></label><label>Documento<input name="title" required value="${esc(d?.title||'')}"/></label><label>Revisión<input name="revision" value="${esc(d?.revision||'R00')}"/></label><label>Estado<select name="status">${optionList(DOCUMENT_STATUSES,d?.status||'Borrador')}</select></label><label>Link de Google Drive<input name="driveUrl" type="url" value="${esc(d?.driveUrl||'')}" placeholder="https://drive.google.com/…"/></label><label class="span-2">Observaciones<textarea name="notes" rows="3">${esc(d?.notes||'')}</textarea></label><div class="modal-actions span-2"><button type="button" class="pill" data-close-modal>Cancelar</button><button type="submit" class="pill dark">Guardar documento</button></div></form>`);
    document.querySelector('[data-close-modal]').onclick=closeModal;
    $('documentForm').onsubmit=e2=>{e2.preventDefault();const o=Object.fromEntries(new FormData(e2.currentTarget).entries());o.updatedAt=nowIso();if(o.id){const ix=data.documents.findIndex(x=>x.id===o.id);data.documents[ix]={...data.documents[ix],...o};}else{o.id=uid('doc');data.documents.push(o);}saveLocal();closeModal();renderAll();};
  }

  function deleteItem(collection,id){
    if(!confirm('¿Eliminar este registro?')) return;
    data[collection]=data[collection].filter(x=>x.id!==id); saveLocal(); renderAll();
  }

  function deleteProject(){
    const p=selectedProject(); if(!p) return;
    if(!confirm(`¿Eliminar el proyecto “${p.name}” y sus referencias de seguimiento?`)) return;
    const id=p.id;
    data.projects=data.projects.filter(x=>x.id!==id);
    data.equipment=data.equipment.filter(x=>x.projectId!==id);
    data.milestones=data.milestones.filter(x=>x.projectId!==id);
    data.documents=data.documents.filter(x=>x.projectId!==id);
    selectedProjectId=data.projects[0]?.id||null; saveLocal(); renderAll();
  }

  function importBalances(){
    let balances=[];
    try{balances=JSON.parse(localStorage.getItem(BALANCE_STORAGE_KEY)||'[]');}catch{}
    if(!Array.isArray(balances)||!balances.length){alert('No se encontraron proyectos de balance térmico guardados en este navegador.');return;}
    let added=0;
    balances.forEach(b=>{
      if(data.projects.some(p=>p.sourceBalanceId===b.id)) return;
      const p={id:uid('prj'),sourceBalanceId:b.id,establishment:'',name:b.nombre||'Proyecto THERMABOT',sector:'',system:'Balance térmico',priority:'Media',stage:'Ingeniería',status:'Activo',progress:15,owner:'',targetDate:'',lastMove:`Importado desde Balance Térmico el ${dateLabel(today())}`,nextAction:'Completar ficha de seguimiento',blocker:'',specRevision:'',drawingRevision:'',supplier:'',expediente:'',notes:'',createdAt:nowIso(),updatedAt:nowIso()};
      data.projects.push(p); if(!selectedProjectId) selectedProjectId=p.id; added++;
    });
    if(added){saveLocal();renderAll();alert(`Se importaron ${added} proyecto(s) del balance térmico.`);}else alert('Los balances guardados ya estaban importados.');
  }

  function bindQuickEditor(){
    const direct=[['quickStatus','status'],['quickStage','stage'],['quickTargetDate','targetDate']];
    direct.forEach(([id,key])=>$(id).onchange=()=>{const p=selectedProject();if(!p)return;p[key]=$(id).value;p.updatedAt=nowIso();saveLocal();renderAll();});
    $('quickProgress').oninput=()=>{const p=selectedProject();if(!p)return;p.progress=clamp($('quickProgress').value,0,100);p.updatedAt=nowIso();saveLocal();$('selectedProgressText').textContent=`${p.progress}%`;$('selectedProgressBar').style.width=`${p.progress}%`;};
    let t=null;
    [['quickNextAction','nextAction'],['quickBlocker','blocker']].forEach(([id,key])=>$(id).oninput=()=>{clearTimeout(t);t=setTimeout(()=>{const p=selectedProject();if(!p)return;p[key]=$(id).value;p.updatedAt=nowIso();saveLocal();renderDashboard();},300);});
  }

  // ---------------- Google Drive ----------------
  function getDriveIds(){try{return JSON.parse(localStorage.getItem(DRIVE_IDS_KEY)||'{}');}catch{return {};}}
  function saveDriveIds(){localStorage.setItem(DRIVE_IDS_KEY,JSON.stringify({rootId:drive.rootId,folderId:drive.folderId,fileId:drive.fileId,folderLink:drive.folderLink}));}
  function setDriveMessage(message,type=''){
    $('driveMessage').textContent=message;
    $('driveMessage').className=`drive-message ${type}`.trim();
  }
  function setDriveBusy(flag){drive.syncing=flag;['connectDriveBtn','pushDriveBtn','pullDriveBtn'].forEach(id=>{if($(id))$(id).disabled=flag || ((id!=='connectDriveBtn')&&!drive.connected);});}

  async function driveFetch(url,options={}){
    if(!drive.token) throw new Error('Google Drive no está autenticado.');
    const headers=new Headers(options.headers||{}); headers.set('Authorization',`Bearer ${drive.token}`);
    const response=await fetch(url,{...options,headers});
    if(response.status===401){drive.connected=false;drive.token=null;renderDrive();throw new Error('La sesión de Google Drive venció. Volvé a conectar.');}
    if(!response.ok){let detail='';try{detail=await response.text();}catch{}throw new Error(`Google Drive respondió ${response.status}${detail?`: ${detail.slice(0,180)}`:''}`);}
    return response;
  }

  async function listDrive(q){
    const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=100`;
    return (await (await driveFetch(url)).json()).files||[];
  }
  const driveNameLiteral=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  async function findOrCreateFolder(name,parentId=null){
    const parentQ=parentId?` and '${driveNameLiteral(parentId)}' in parents`:` and 'root' in parents`;
    const q=`name = '${driveNameLiteral(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQ}`;
    const existing=(await listDrive(q))[0]; if(existing) return existing;
    const body={name,mimeType:'application/vnd.google-apps.folder'}; if(parentId)body.parents=[parentId];
    const response=await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return response.json();
  }

  async function findTrackerFile(folderId){
    const q=`name = '${driveNameLiteral(TRACKER_FILE_NAME)}' and '${driveNameLiteral(folderId)}' in parents and trashed = false`;
    return (await listDrive(q))[0]||null;
  }

  async function createTrackerFile(folderId){
    const boundary='thermabot_'+Math.random().toString(36).slice(2);
    const metadata=JSON.stringify({name:TRACKER_FILE_NAME,mimeType:'application/json',parents:[folderId]});
    const content=JSON.stringify(data,null,2);
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const response=await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
    return response.json();
  }

  async function ensureDriveStructure(){
    const cached=getDriveIds();
    setDriveMessage('Preparando carpeta THERMABOT en Google Drive…');
    let root=null,folder=null,file=null;
    try{
      if(cached.rootId){const r=await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cached.rootId)}?fields=id,name,mimeType,webViewLink`);root=await r.json();}
    }catch{}
    if(!root) root=await findOrCreateFolder(ROOT_FOLDER_NAME,null);
    drive.rootId=root.id;
    try{
      if(cached.folderId){const r=await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cached.folderId)}?fields=id,name,mimeType,webViewLink`);folder=await r.json();}
    }catch{}
    if(!folder) folder=await findOrCreateFolder(TRACKER_FOLDER_NAME,drive.rootId);
    drive.folderId=folder.id; drive.folderLink=folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`;
    try{
      if(cached.fileId){const r=await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cached.fileId)}?fields=id,name,modifiedTime,webViewLink`);file=await r.json();}
    }catch{}
    if(!file) file=await findTrackerFile(drive.folderId);
    if(!file) file=await createTrackerFile(drive.folderId);
    drive.fileId=file.id; saveDriveIds();
  }

  async function readRemoteData(){
    if(!drive.fileId) return null;
    const response=await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(drive.fileId)}?alt=media`);
    return normalizeState(await response.json());
  }

  async function pushDrive(showMessage=true){
    if(!drive.connected||!drive.fileId) throw new Error('Conectá Google Drive primero.');
    if(drive.syncing) return;
    setDriveBusy(true); if(showMessage)setDriveMessage('Guardando seguimiento en Google Drive…');
    try{
      const response=await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(drive.fileId)}?uploadType=media&fields=id,modifiedTime`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data,null,2)});
      await response.json(); drive.lastSync=new Date();
      if(showMessage)setDriveMessage('Seguimiento sincronizado con Google Drive.','ok');
    } finally {setDriveBusy(false);renderDrive();}
  }

  async function pullDrive(force=true){
    if(!drive.connected||!drive.fileId) throw new Error('Conectá Google Drive primero.');
    setDriveBusy(true); setDriveMessage('Cargando seguimiento desde Google Drive…');
    try{
      const remote=await readRemoteData();
      if(!remote) throw new Error('No se pudo leer el archivo maestro.');
      if(force || new Date(remote.updatedAt)>new Date(data.updatedAt)){
        data=remote; selectedProjectId=data.projects[0]?.id||null; saveLocal({touch:false,sync:false}); renderAll();
      }
      drive.lastSync=new Date(); setDriveMessage('Datos cargados desde Google Drive.','ok');
    } finally {setDriveBusy(false);renderDrive();}
  }

  async function initialDriveSync(){
    await ensureDriveStructure();
    const remote=await readRemoteData();
    const remoteTime=remote?.updatedAt?new Date(remote.updatedAt).getTime():0;
    const localTime=data.updatedAt?new Date(data.updatedAt).getTime():0;
    if(remote && remote.projects?.length && remoteTime>localTime){
      data=remote; selectedProjectId=data.projects[0]?.id||null; saveLocal({touch:false,sync:false}); renderAll(); setDriveMessage('Drive tenía una versión más reciente. Se cargó automáticamente.','ok');
    }else if(localTime>remoteTime || (!remote?.projects?.length && data.projects.length)){
      await pushDrive(false); setDriveMessage('La versión local se guardó en Drive.','ok');
    }else setDriveMessage('Seguimiento sincronizado.','ok');
    drive.lastSync=new Date();
  }

  function connectDrive(){
    const clientId=(localStorage.getItem(DRIVE_CLIENT_KEY)||'').trim();
    if(!clientId){setView('drive');setDriveMessage('Primero configurá el Google OAuth Client ID.','error');return;}
    if(!window.google?.accounts?.oauth2){setDriveMessage('Google Identity todavía no terminó de cargar. Esperá unos segundos y reintentá.','error');return;}
    const tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:DRIVE_SCOPE,callback:async response=>{
      if(response.error){setDriveMessage(`No se pudo autenticar: ${response.error}`,'error');return;}
      drive.token=response.access_token; drive.connected=true; renderDrive(); setDriveBusy(true);
      try{await initialDriveSync();}catch(err){setDriveMessage(err.message,'error');}finally{setDriveBusy(false);renderAll();}
    }});
    tokenClient.requestAccessToken({prompt:'consent'});
  }

  function renderDrive(){
    if(window.TBCloud){
      const cloud=window.TBCloud.state?.()||{message:window.TBCloud.status(),phase:'checking'},preview=cloud.phase==='preview';
      const text=cloud.message||'Comprobando Drive…',quick=$('driveQuickBtn');
      if(quick.textContent!==text)quick.textContent=text;
      quick.dataset.cloudPhase=cloud.phase;quick.classList.toggle('dark',!!cloud.verified);
      const health=$('cloudHealthIndicator');if(health){
        const mode=cloud.verified?'saved':cloud.phase==='saving'?'saving':cloud.pending?'pending':cloud.phase==='error'?'error':cloud.phase==='remote-change'?'warning':'checking';
        const labels={saved:'Guardado',saving:'Guardando…',pending:'Pendiente',error:'Sin conexión',warning:'Revisar',checking:'Verificando'};
        health.className='cloud-health '+mode;health.querySelector('span').textContent=labels[mode];health.title=text;
      }
      $('trackerSaveStatus').textContent=text;
      $('driveStateTitle').textContent=text;$('driveStateTitle').dataset.cloudPhase=cloud.phase;
      $('driveFolderState').textContent=preview?'Prueba local':'Base de datos y balances';
      $('driveFileState').textContent=preview?'Sin conexión a la nube':'THERMABOT-base.json';
      const at=cloud.updatedAt&&new Date(cloud.updatedAt);
      $('driveSyncState').textContent=at&&Number.isFinite(at.getTime())?at.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'Sin confirmar';
      $('driveModeState').textContent=preview?'Sólo navegador':cloud.pending?'Cambios locales pendientes':cloud.verified?'Drive + copia local':cloud.phase==='error'?'Copia local · conexión no confirmada':cloud.phase==='remote-change'?'Cambios de otro dispositivo':'Copia local · verificando Drive';
      for(const id of ['pushDriveBtn','pullDriveBtn','connectDriveBtn'])$(id).disabled=!!cloud.busy||preview;
      const link=$('openDriveFolder');link.href=preview?'#':'https://drive.google.com/drive/folders/1NslvxxEpY5PmTpbSCBBM6IDhjsvRC686';link.classList.toggle('disabled',preview);
      $('driveMessage').textContent=preview?'Esta versión de prueba guarda únicamente en este navegador.':cloud.pending?'Tus últimas modificaciones siguen pendientes. La fecha indica la última escritura confirmada, no estos cambios.':text;
      $('driveMessage').classList.toggle('ok',!!cloud.verified);return;
    }
    const clientId=localStorage.getItem(DRIVE_CLIENT_KEY)||'';
    if($('driveClientId') && document.activeElement!==$('driveClientId')) $('driveClientId').value=clientId;
    $('driveQuickBtn').textContent=drive.connected?'Drive conectado':'Drive desconectado';
    $('driveQuickBtn').classList.toggle('dark',drive.connected);
    const health=$('cloudHealthIndicator');if(health){const ok=drive.connected;health.className='cloud-health '+(ok?'saved':'error');health.querySelector('span').textContent=ok?'Guardado':'Sin conexión';health.title=ok?'Drive conectado':'Drive desconectado';}
    $('driveStateTitle').textContent=drive.connected?'Google Drive conectado':'Drive desconectado';
    $('driveFolderState').textContent=drive.folderId?`${ROOT_FOLDER_NAME} / ${TRACKER_FOLDER_NAME}`:'—';
    $('driveFileState').textContent=drive.fileId?TRACKER_FILE_NAME:'—';
    $('driveSyncState').textContent=drive.lastSync?drive.lastSync.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'—';
    $('driveModeState').textContent=drive.connected?'Local + Drive':'Local';
    $('pushDriveBtn').disabled=!drive.connected||drive.syncing;
    $('pullDriveBtn').disabled=!drive.connected||drive.syncing;
    const link=$('openDriveFolder');
    if(drive.folderLink){link.href=drive.folderLink;link.classList.remove('disabled');}else{link.href='#';link.classList.add('disabled');}
  }

  function bindEvents(){
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    document.querySelectorAll('[data-go-view]').forEach(b=>b.onclick=()=>setView(b.dataset.goView));
    $('newProjectBtn').onclick=()=>openProjectModal(); $('newProjectBtn2').onclick=()=>openProjectModal();
    $('newEquipmentBtn').onclick=()=>openEquipmentModal(); $('newMilestoneBtn').onclick=()=>openMilestoneModal(); $('newDocumentBtn').onclick=()=>openDocumentModal();
    $('editProjectBtn').onclick=()=>selectedProjectId&&openProjectModal(selectedProjectId); $('deleteProjectBtn').onclick=deleteProject;
    $('importBalancesBtn').onclick=importBalances;
    $('trackerModalClose').onclick=closeModal; $('trackerModal').onclick=e=>{if(e.target===$('trackerModal'))closeModal();};
    $('projectSearch').oninput=renderProjects;
    [['filterEstablishment','establishment'],['filterSector','sector'],['filterSystem','system'],['filterStage','stage']].forEach(([id,key])=>$(id).onchange=()=>{filters[key]=$(id).value;renderDashboard();});
    $('clearFiltersBtn').onclick=()=>{filters={establishment:'',sector:'',system:'',stage:''};renderDashboard();};
    bindQuickEditor();
    $('driveQuickBtn').onclick=()=>{setView('drive');if(!window.TBCloud&&localStorage.getItem(DRIVE_CLIENT_KEY))connectDrive();};
    if($('saveDriveClientBtn'))$('saveDriveClientBtn').onclick=()=>{const v=$('driveClientId').value.trim();if(v)localStorage.setItem(DRIVE_CLIENT_KEY,v);else localStorage.removeItem(DRIVE_CLIENT_KEY);setDriveMessage(v?'Client ID guardado en este navegador. Ya podés conectar Drive.':'Client ID eliminado.',v?'ok':'');renderDrive();};
    $('restorePreviousBtn').onclick=()=>{
      const candidates=[];
      const previousRaw=localStorage.getItem('thermabot.tracker.previous.v1');if(previousRaw)candidates.push({at:'Copia anterior',raw:previousRaw});
      try{for(const x of JSON.parse(localStorage.getItem('thermabot.tracker.history.v1')||'[]'))if(x?.raw)candidates.push({at:x.at||'Historial',raw:x.raw});}catch{}
      const parsed=candidates.map(x=>{try{const state=normalizeState(JSON.parse(x.raw));const tr=state.projects.filter(p=>p.installedTR!==null&&p.installedTR!==undefined&&p.installedTR!=='').length;const dates=state.projects.filter(p=>p.installedOn||p.completedOn).length;return {...x,state,tr,dates,score:tr*1000+dates*100+state.projects.length};}catch{return null;}}).filter(Boolean).sort((a,b)=>b.score-a.score);
      const best=parsed[0];
      if(!best){setDriveMessage('No hay copias anteriores disponibles en este navegador.','error');return;}
      if(!confirm('Se encontró una copia de recuperación con '+best.state.projects.length+' proyectos, '+best.tr+' con TR registradas y '+best.dates+' con fechas de instalación/cierre. ¿Restaurarla? La base actual se conservará en el historial.'))return;
      const current=localStorage.getItem(STORAGE_KEY);if(current){try{const history=JSON.parse(localStorage.getItem('thermabot.tracker.history.v1')||'[]');history.unshift({at:new Date().toISOString(),raw:current});localStorage.setItem('thermabot.tracker.history.v1',JSON.stringify(history.slice(0,5)));}catch{}}
      data=best.state;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
      selectedProjectId=data.projects[0]?.id||null;renderAll();
      setDriveMessage('Datos anteriores recuperados. Revisalos antes de guardar en Drive.','ok');
    };
    $('connectDriveBtn').onclick=()=>window.TBCloud?window.TBCloud.check():connectDrive();
    $('pushDriveBtn').onclick=()=>window.TBCloud?window.TBCloud.save():pushDrive(true).catch(err=>setDriveMessage(err.message,'error'));
    $('pullDriveBtn').onclick=()=>{if(window.TBCloud)return window.TBCloud.check();if(confirm('¿Reemplazar los datos locales con la copia de Google Drive?'))pullDrive(true).catch(err=>setDriveMessage(err.message,'error'));};
  }

  function init(){
    const cached=getDriveIds(); drive.rootId=cached.rootId||null; drive.folderId=cached.folderId||null; drive.fileId=cached.fileId||null; drive.folderLink=cached.folderLink||null;
    bindEvents();
    window.addEventListener('thermabot:cloud-state',renderDrive);
    const params=new URLSearchParams(location.search); const requested=params.get('projectId');
    if(projectById(requested)) selectedProjectId=requested;
    renderAll(); setView(['tasks','dashboard','projects','equipment','milestones','documents','drive','agenda','balances','audits','backup','calculator','water','project','activity','settings'].includes(params.get('view'))?params.get('view'):'dashboard');
    navigationReady=true;
    window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);if(projectById(params.get('projectId')))selectedProjectId=params.get('projectId');renderAll();setView(params.get('view')||'dashboard',{replace:true});});
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }


  window.TBTracker={
    snapshot:()=>JSON.parse(JSON.stringify(data)),
    selectedId:()=>selectedProjectId,
    view:()=>view,
    select:selectProject,
    navigate:setView,
    editProject:openProjectModal,
    editEquipment:openEquipmentModal,
    editMilestone:openMilestoneModal,
    editDocument:openDocumentModal,
    mutate:fn=>{const old=data;data=JSON.parse(JSON.stringify(data));try{fn(data);saveLocal();}catch(error){data=old;throw error;}renderAll();},
    refresh:()=>{data=loadLocal();if(!projectById(selectedProjectId))selectedProjectId=data.projects[0]?.id||null;renderAll();}
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();

