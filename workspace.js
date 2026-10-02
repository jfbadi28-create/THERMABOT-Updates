(()=>{
'use strict';
const BALANCES='thermabot.proyectos.v1',TRACKER='thermabot.tracker.v1',LIB='thermabot.workspace.v1',PREVIOUS='thermabot.workspace.previous.v1';
const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=(key,fallback)=>{const raw=localStorage.getItem(key);if(!raw)return fallback;try{return JSON.parse(raw)}catch{throw Error('No se pudo leer '+key+'. Conservá los datos antes de seguir.')}};
let library,balances,tracker,token=null,files=[],busy=false;
function reloadData(){library=parse(LIB,{schema:1,links:{},audits:[]});balances=parse(BALANCES,[]);tracker=parse(TRACKER,{projects:[],milestones:[]});}
function notify(text){$('message').textContent=text;}
function saveLibrary(){const old=localStorage.getItem(LIB);if(old)localStorage.setItem(PREVIOUS,old);library.updatedAt=new Date().toISOString();localStorage.setItem(LIB,JSON.stringify(library));$('driveState').textContent='Hay cambios locales. Guardá una nueva versión en Drive.';}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function options(items,valueKey,labelKey){return items.map(p=>'<option value="'+escape(p[valueKey])+'">'+escape(p[labelKey])+'</option>').join('');}
function projectUrl(p,view='projects'){return 'tracker.html?projectId='+encodeURIComponent(p.id)+'&view='+view;}
function linkedBalance(p){return balances.find(b=>library.links[b.id]===p.id||p.sourceBalanceId===b.id);}
function render(){
 reloadData();const agenda=TBWorkspace.agenda(tracker,today()),active=tracker.projects.filter(p=>!['Finalizado','Suspendido'].includes(p.status));
 $('stats').innerHTML=[['En curso',active.length],['Pendientes',agenda.length],['Vencidos',agenda.filter(t=>t.overdue).length],['Balances guardados',balances.length]].map(([label,n])=>'<article class="stat"><span>'+label+'</span><strong>'+n+'</strong></article>').join('');
 const filter=$('agendaProject').value;$('agendaProject').innerHTML='<option value="">Todos</option>'+options(tracker.projects,'id','name');$('agendaProject').value=filter;
 $('agendaList').innerHTML=agenda.filter(a=>!filter||a.projectId===filter).map(a=>'<article class="item '+(a.overdue?'overdue':'')+'"><h3>'+escape(a.title)+'</h3><p>'+escape(a.project)+' · '+escape(a.owner||'Responsable sin definir')+'</p><p class="badge">'+escape(a.overdue?'Vencido':a.status)+' · '+escape(a.dueDate||'Sin fecha')+'</p><p><a href="'+projectUrl({id:a.projectId},a.id.startsWith('next:')?'projects':'milestones')+'">Abrir proyecto y actualizar</a></p></article>').join('')||'<p>No hay pendientes en esta selección.</p>';
 const q=$('projectSearch').value.toLowerCase(),mode=$('projectStatus').value;
 $('projectList').innerHTML=tracker.projects.filter(p=>[p.name,p.establishment,p.sector].join(' ').toLowerCase().includes(q)&& (mode==='all'||(mode==='finished'?p.status==='Finalizado':!['Finalizado','Suspendido'].includes(p.status)))).map(p=>{const b=linkedBalance(p);return '<article class="item"><h3>'+escape(p.name)+'</h3><p>'+escape(p.establishment)+' · '+escape(p.sector)+' · '+escape(p.status)+'</p><p>Próxima acción: '+escape(p.nextAction||'Sin definir')+'</p><div class="actions"><a href="'+projectUrl(p)+'">Ficha de seguimiento</a><a href="'+projectUrl(p,'documents')+'">Documentos</a>'+(b?'<a href="index.html?balanceId='+encodeURIComponent(b.id)+'">Continuar balance</a>':'<a href="index.html">Crear balance</a>')+'</div></article>'}).join('')||'<p>No hay proyectos en esta selección.</p>';
 $('balanceList').innerHTML=balances.map(b=>'<article class="item"><h3>'+escape(b.nombre)+'</h3><p>'+b.ambientes.length+' ambientes · '+escape(b.condiciones.ciudad||'Sin ciudad')+'</p><label>Proyecto de seguimiento<select data-link="'+escape(b.id)+'"><option value="">Sin vínculo</option>'+options(tracker.projects,'id','name')+'</select></label><div class="actions"><a href="index.html?balanceId='+encodeURIComponent(b.id)+'">Abrir y editar</a><button data-audit="'+escape(b.id)+'">Revisar</button><button data-export="'+escape(b.id)+'">Descargar cálculo completo</button></div></article>').join('')||'<p>No hay balances guardados en este navegador. Creá uno o recuperá una copia.</p>';
 document.querySelectorAll('[data-link]').forEach(el=>{el.value=library.links[el.dataset.link]||tracker.projects.find(p=>p.sourceBalanceId===el.dataset.link)?.id||'';el.onchange=()=>{library.links[el.dataset.link]=el.value;saveLibrary();render();};});
 document.querySelectorAll('[data-audit]').forEach(el=>el.onclick=()=>runAudit(el.dataset.audit));
 document.querySelectorAll('[data-export]').forEach(el=>el.onclick=()=>download({format:'thermabot-workspace',schema:1,balances:[balances.find(b=>b.id===el.dataset.export)],library:{schema:1,links:library.links,audits:[]}},'balance-thermabot.json'));
 $('auditBalance').innerHTML=options(balances,'id','nombre');$('runAudit').disabled=!balances.length;
 $('auditList').innerHTML=library.audits.slice().reverse().map(a=>'<article class="item"><h3>'+escape(a.balanceName)+'</h3><p class="muted">'+escape(a.generatedAt)+' · reglas '+escape(a.ruleVersion)+'</p><p>'+escape(a.scope)+'</p>'+a.findings.map(f=>'<div class="item '+(f.severity==='CRÍTICO'?'critical':'warning')+'"><span class="badge">'+escape(f.severity)+'</span><h3>'+escape(f.subject)+'</h3><p>'+escape(f.problem)+'</p><p><b>Riesgo:</b> '+escape(f.risk)+'</p><p><b>Acción:</b> '+escape(f.action)+'</p></div>').join('')+(!a.findings.length?'<p>Sin hallazgos en las comprobaciones ejecutadas.</p>':'')+'<h4>Verificaciones documentales pendientes</h4><ul>'+a.pending.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul><label>Observaciones y evidencia documental<textarea data-evidence="'+escape(a.id)+'" rows="3">'+escape(a.evidence||'')+'</textarea></label><button data-save-evidence="'+escape(a.id)+'">Guardar observaciones</button><button data-report="'+escape(a.id)+'">Descargar revisión</button></article>').join('')||'<p>Elegí un balance para iniciar la revisión.</p>';
 document.querySelectorAll('[data-save-evidence]').forEach(el=>el.onclick=()=>guard(async()=>{const a=library.audits.find(a=>a.id===el.dataset.saveEvidence); a.evidence=document.querySelector('[data-evidence="'+CSS.escape(a.id)+'"]').value; a.reviewedAt=new Date().toISOString();saveLibrary();notify('Observaciones guardadas.');}));
 document.querySelectorAll('[data-report]').forEach(el=>el.onclick=()=>download(library.audits.find(a=>a.id===el.dataset.report),'auditoria-thermabot.json'));
}
function showTab(id){document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==id);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));}
function runAudit(id){const b=balances.find(b=>b.id===id);const report=TBWorkspace.audit(b);report.id=crypto.randomUUID();report.inputSnapshot=JSON.parse(JSON.stringify(b));library.audits.push(report);saveLibrary();render();showTab('audits');notify('Revisión guardada con una copia de los datos revisados.');}
function snapshot(){reloadData();return {format:'thermabot-workspace',schema:1,exportedAt:new Date().toISOString(),balances,library};}
function download(value,name){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function restore(value){
 if(value.format!=='thermabot-workspace'||value.schema!==1||!Array.isArray(value.balances)||!value.library||!Array.isArray(value.library.audits)||typeof value.library.links!=='object')throw Error('Formato de respaldo no reconocido.');
 reloadData();const merged=TBWorkspace.mergeBalances(balances,value.balances);
 const old=localStorage.getItem(BALANCES);if(old)localStorage.setItem(BALANCES+'.previous',old);
 localStorage.setItem(BALANCES,JSON.stringify(merged));
 // Existing links and audits are preserved. Imported conflicts get a new balance ID and stay unlinked.
 for(const [id,projectId]of Object.entries(value.library.links))if(!Object.hasOwn(library.links,id)&&merged.some(b=>b.id===id))library.links[id]=projectId;
 for(const a of value.library.audits)if(a&&typeof a.id==='string'&&Array.isArray(a.findings)&&Array.isArray(a.pending)&&!library.audits.some(x=>x.id===a.id))library.audits.push(a);
 saveLibrary();render();notify('Copia recuperada. Los balances distintos se conservaron como versiones separadas.');
}
async function drive(url,options={}){
 if(!token)throw Error('Conectá Drive para cálculos.');
 const r=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});
 if(r.status===401){token=null;$('saveDrive').disabled=true;$('refreshDrive').disabled=true;throw Error('La autorización venció. Volvé a conectar Drive.');}
 if(!r.ok)throw Error('Drive no completó la operación (HTTP '+r.status+'). La copia local se conserva.');
 return r.json();
}
function folder(){const value=$('folderId').value.trim();const id=value.match(/folders\/([\w-]+)/)?.[1]||value;if(!/^[\w-]+$/.test(id))throw Error('Carpeta de Drive inválida.');return id;}
async function versions(){
 const q="'"+folder()+"' in parents and trashed = false and appProperties has { key='thermabotType' and value='workspace-v1' }";
 const data=await drive('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&fields=files(id,name,modifiedTime,webViewLink)&orderBy=createdTime%20desc&pageSize=100');files=data.files||[];
 $('driveVersions').innerHTML=files.map(f=>'<article class="item"><h3>'+escape(f.name)+'</h3><p>'+escape(f.modifiedTime)+'</p><button data-restore="'+escape(f.id)+'">Recuperar esta versión</button></article>').join('')||'<p>No hay versiones creadas por esta conexión en la carpeta.</p>';
 document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>guard(async()=>{const value=await drive('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(b.dataset.restore)+'?alt=media');restore(value);}));
}
async function saveDrive(){
 const value=snapshot(),boundary='thermabot_'+crypto.randomUUID();const metadata={name:'THERMABOT-calculos-'+value.exportedAt.replace(/[:.]/g,'-')+'.json',parents:[folder()],appProperties:{thermabotType:'workspace-v1'}};
 const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(value)+'\r\n--'+boundary+'--';
 const result=await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const verify=await drive('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(result.id)+'?alt=media');
 if(JSON.stringify(verify)!==JSON.stringify(value))throw Error('No se pudo verificar el respaldo recibido.');
 $('driveState').textContent='Respaldo verificado en Drive · '+new Date().toLocaleString('es-AR');notify('Se guardó una versión nueva de cálculos y auditorías en Drive.');await versions();
}
function connect(){
 const id=$('clientId').value.trim();if(!id)throw Error('Ingresá el identificador de conexión Google que usás en el seguimiento.');
 if(!window.google?.accounts?.oauth2)throw Error('Google todavía no está listo. Reintentá en unos segundos.');
 google.accounts.oauth2.initTokenClient({client_id:id,scope:'https://www.googleapis.com/auth/drive.file',callback:r=>{if(r.error||!r.access_token){notify('Google no autorizó la conexión.');return;}token=r.access_token;localStorage.setItem('thermabot.drive.client_id',id);$('saveDrive').disabled=false;$('refreshDrive').disabled=false;$('driveState').textContent='Drive conectado. Podés guardar una versión de cálculos.';guard(versions);},error_callback:()=>notify('No se completó la autorización de Google.')}).requestAccessToken({prompt:'consent'});
}
async function guard(fn){if(busy)return;busy=true;try{await fn();}catch(e){notify(e.message);}finally{busy=false;}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
for(const id of ['agendaProject','projectStatus'])$(id).onchange=()=>guard(async()=>render());$('projectSearch').oninput=()=>guard(async()=>render());
$('runAudit').onclick=()=>guard(async()=>runAudit($('auditBalance').value));$('export').onclick=()=>guard(async()=>download(snapshot(),'THERMABOT-calculos-y-auditorias.json'));
$('import').onchange=e=>guard(async()=>{const f=e.target.files[0];if(f){if(f.size>5000000)throw Error('El respaldo supera 5 MB.');restore(JSON.parse(await f.text()));}e.target.value='';});
$('connect').onclick=()=>guard(async()=>connect());$('saveDrive').onclick=()=>guard(saveDrive);$('refreshDrive').onclick=()=>guard(versions);
$('clientId').value=localStorage.getItem('thermabot.drive.client_id')||'';
window.addEventListener('storage',()=>guard(async()=>render()));
guard(async()=>render());
})();