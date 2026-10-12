(()=>{'use strict';
const STORAGE='thermabot.tracker.v1';
const HISTORY='thermabot.ai.history.v1';
const $=s=>document.querySelector(s);
const SUITE_URL=new URL('./thermabot-ai-suite.js',document.currentScript?.src||location.href).href;
function loadCouncil(){return new Promise((resolve,reject)=>{if(window.ThermabotCouncilL3)return resolve(window.ThermabotCouncilL3);const el=document.createElement('script');el.src=new URL('./thermabot-council-l3.js',document.currentScript?.src||location.href).href;el.onload=()=>window.ThermabotCouncilL3?resolve(window.ThermabotCouncilL3):reject(Error('Módulo de Consejo incompleto'));el.onerror=()=>reject(Error('No se pudo cargar el Consejo'));document.head.appendChild(el);});}
function loadSuite(){return new Promise((resolve,reject)=>{if(window.ThermabotAISuite)return resolve(window.ThermabotAISuite);const el=document.createElement('script');el.src=SUITE_URL;el.onload=()=>window.ThermabotAISuite?resolve(window.ThermabotAISuite):reject(Error('Módulo incompleto'));el.onerror=()=>reject(Error('No se cargó el módulo de análisis'));document.head.appendChild(el);});}
// Cloudflare Pages y dominios propios consultan su API local; GitHub Pages conserva Vercel.
const ON_GITHUB_PAGES=location.hostname.endsWith('github.io');
const API_URL=ON_GITHUB_PAGES?'https://thermabot-ai-backend.vercel.app/api/ai-chat':new URL('/api/ai-chat',location.origin).href;
function readState(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{return{}}}
function context(){
 const data=readState(),params=new URLSearchParams(location.search),id=params.get('projectId');
 const p=(data.projects||[]).find(x=>x.id===id)||null;
 const project=p?{id:p.id,name:p.name,establishment:p.establishment,sector:p.sector,system:p.system,priority:p.priority,stage:p.stage,status:p.status,progress:p.progress,targetDate:p.targetDate,lastMove:p.lastMove,nextAction:p.nextAction,blocker:p.blocker,specRevision:p.specRevision,drawingRevision:p.drawingRevision,supplier:p.supplier,expediente:p.expediente,notes:p.notes}:null;
 return {project,portfolio:{projects:(data.projects||[]).map(x=>({id:x.id,name:x.name,establishment:x.establishment,sector:x.sector,system:x.system,priority:x.priority,stage:x.stage,status:x.status,progress:x.progress,targetDate:x.targetDate,nextAction:x.nextAction,blocker:x.blocker})),milestones:(data.milestones||[]).slice(0,150),equipment:(data.equipment||[]).slice(0,150),documents:(data.documents||[]).slice(0,150)}};
}
function label(c){return c.project?('Contexto: '+(c.project.name||'Proyecto')+' · '+(c.project.stage||'Sin etapa')+' · '+(c.project.status||'Sin estado')):'Contexto: cartera general de proyectos';}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function loadHistory(){try{return JSON.parse(sessionStorage.getItem(HISTORY)||'[]').slice(-10)}catch{return[]}}
function saveHistory(h){sessionStorage.setItem(HISTORY,JSON.stringify(h.slice(-10)))}
function build(){
 const wrap=document.createElement('div');
 wrap.innerHTML=`<button class="tb-ai-launcher" id="tbAiLauncher" aria-label="Abrir THERMABOT AI" title="THERMABOT AI">AI<i>✦</i></button>
 <section class="tb-ai-panel" id="tbAiPanel" hidden aria-label="THERMABOT AI">
  <header class="tb-ai-head"><div class="tb-ai-brand"><div class="tb-ai-mark">AI</div><div><div class="tb-ai-title">THERMABOT AI</div><div class="tb-ai-sub">Asistente técnico</div></div></div><button class="tb-ai-close" id="tbAiClose" aria-label="Cerrar">×</button></header>
  <div class="tb-ai-context"><span class="tb-ai-context-dot"></span><span class="tb-ai-context-text" id="tbAiContext"></span></div>
  <div class="tb-ai-messages" id="tbAiMessages"></div><div class="tb-ai-actions"><button type="button" id="tbAiPortfolio">Panel de prioridades</button><button type="button" id="tbAiAudit">Auditoría de proyecto</button><button type="button" id="tbAiDocs">Documentos vinculados</button><button type="button" id="tbAiProposal">Preparar cambio</button><button type="button" id="tbAiCouncil">Consejo IA L3</button></div>
  <form class="tb-ai-form" id="tbAiForm"><div class="tb-ai-box"><textarea class="tb-ai-input" id="tbAiInput" rows="1" placeholder="Preguntá sobre tus proyectos…"></textarea><button class="tb-ai-send" id="tbAiSend" type="submit" aria-label="Enviar">↑</button></div><div class="tb-ai-foot">V1 · consulta y análisis · no modifica datos${ON_GITHUB_PAGES?'':' · <button id="tbAiCheck" class="tb-ai-check" type="button">Comprobar conexión</button>'}</div></form>
 </section>`;
 document.body.append(...wrap.childNodes);
}
function add(role,text,extra=''){const d=document.createElement('div');d.className='tb-ai-msg '+role+(extra?' '+extra:'');d.textContent=text;$('#tbAiMessages').appendChild(d);$('#tbAiMessages').scrollTop=$('#tbAiMessages').scrollHeight;return d}
function welcome(){
 const m=$('#tbAiMessages');if(m.children.length)return;
 add('assistant','Hola. Puedo analizar la cartera de THERMABOT y el proyecto que tengas abierto.');
 const s=document.createElement('div');s.className='tb-ai-suggestions';
 ['¿Qué necesita atención?','Resumí el proyecto abierto','Detectá datos faltantes'].forEach(t=>{const b=document.createElement('button');b.className='tb-ai-chip';b.type='button';b.textContent=t;b.onclick=()=>send(t);s.appendChild(b)});m.appendChild(s);
}
async function checkConnection(){
 const button=$('#tbAiCheck');if(!button)return;button.disabled=true;
 try{
  const response=await fetch(API_URL,{method:'GET',cache:'no-store'});
  const info=await response.json().catch(()=>null);
  if(!response.ok||!info?.ok)throw new Error('La ruta API no respondió correctamente (HTTP '+response.status+').');
  add('system',info.configured?'La clave está configurada en Cloudflare. Modelo: '+info.model+'. Enviá una consulta para probar la respuesta.':'Falta OPENAI_API_KEY en Cloudflare Pages → Settings → Variables and Secrets → Production. Guardala como Secret y desplegá nuevamente.');
 }catch(e){add('system','No pude comprobar la conexión: '+e.message)}
 finally{button.disabled=false}
}
async function send(text){
 text=String(text||'').trim();if(!text)return;
 add('user',text);$('#tbAiInput').value='';$('#tbAiSend').disabled=true;const loading=add('assistant','Analizando…','loading');
 const h=loadHistory();
 try{
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,history:h.slice(-8),context:context()})});
  const p=await r.json().catch(()=>null);loading.remove();if(!p)throw new Error('El servidor devolvió una respuesta no válida (HTTP '+r.status+').');
  if(!r.ok||!p.ok)throw new Error(p.error||('Error '+r.status));
  if(!p.reply)throw new Error('La API no devolvió texto.');add('assistant',p.reply);h.push({role:'user',content:text},{role:'assistant',content:p.reply});saveHistory(h);
 }catch(e){loading.remove();add('system','No pude consultar la IA: '+e.message)}
 finally{$('#tbAiSend').disabled=false;$('#tbAiInput').focus()}
}
async function localAction(kind){try{const suite=await loadSuite(),data=readState(),selected=context().project; if(kind==='portfolio'){const a=suite.analyze(data);add('assistant',`Resumen local (${a.asOf}): ${a.counts.projects} proyectos, ${a.counts.active} abiertos, ${a.counts.overdue} seguimientos vencidos, ${a.counts.blocked} con bloqueos o esperas y ${a.counts.inconsistent} inconsistencias. Prioridades:\n${a.queue.slice(0,8).map((x,i)=>`${i+1}. ${x.establishment} — ${x.name}: ${x.nextAction}${x.overdue?' [seguimiento vencido]':''}`).join('\n')}\nFuente: datos de este navegador, no confirmados en producción.`);return;}if(!selected){add('system','Abrí primero la ficha del proyecto para consultar su auditoría o documentos.');return;}if(kind==='audit'){const audit=suite.technicalChecklist(data,selected.id);add('assistant',`Revisión orientativa — ${selected.name}\n${audit.checks.map(x=>'- '+x.topic+': '+x.status).join('\n')}\n${audit.warning}`);return;}if(kind==='docs'){const docs=suite.linkedDocs(data,selected.id);add('assistant',docs.length?`Documentos registrados (${docs.length}):\n${docs.map(d=>'- '+d.title+' '+d.revision+(d.url?' — '+d.url:'')).join('\n')}`:'No hay documentos vinculados registrados en el navegador. No significa que no existan en Drive.');}}catch(e){add('system','No se pudo completar el análisis local: '+e.message);}}
async function prepareChange(){try{const suite=await loadSuite(),selected=context().project;if(!selected){add('system','Abrí un proyecto antes de preparar cambios.');return;}const field=prompt('Campo a proponer: priority, stage, status, progress, nextAction, nextDueDate, blocker, specRevision, drawingRevision, system, notes, waitingFor','nextAction');if(field===null)return;const value=prompt('Nuevo valor para '+field+' (borrador sin guardar):','');if(value===null)return;const result=suite.proposedChange(readState(),selected.id,{[field.trim()]:value});if(!result.ok){add('system',result.error);return;}const p=result.proposal;add('assistant',`PROPUESTA SIN GUARDAR — ${p.projectName}\n${p.changes.map(x=>x.field+': '+String(x.before??'(vacío)')+' → '+String(x.after)).join('\n')}\nPendiente de aprobación. No se realizaron cambios en la base ni en la web.`);}catch(e){add('system','Error preparando propuesta: '+e.message);}}
async function runCouncil(){
 try{
  const selected=context().project;if(!selected){add('system','Abrí primero la ficha de un proyecto para ejecutar el Consejo.');return;}
  const council=await loadCouncil(),data=readState(),result=council.report(data,selected.id);
  if(!result.ok){add('system',result.error);return;}
  const findings=result.findings.map(x=>'• '+x.role+': '+x.title+' — '+x.action).join('\n');
  const memory=result.memories.map(x=>'• '+x.project+' (similitud '+(x.similarity*100).toFixed(0)+'%; fuente '+(x.source?'registrada':'no registrada')+')').join('\n');
  add('assistant','CONSEJO DE INGENIERÍA NIVEL 3 — PRELIMINAR\nProyecto: '+result.project.name+'\n\nREVISIONES CRUZADAS\n'+findings+'\n\nANTECEDENTES LÉXICOS\n'+(memory||'Sin coincidencias en esta sesión')+'\n\nREDISEÑOS A EVALUAR\n'+result.redesign.options.map(x=>'• '+x.name+': '+x.needs.join(', ')).join('\n')+'\n\n'+result.decision+'\nNo se modificaron datos. Para simulación numérica se requieren caudales de alimentación/extracción y volumen.');
 }catch(e){add('system','No se pudo ejecutar el Consejo: '+e.message);}
}
function syncContext(){const el=$('#tbAiContext');if(el)el.textContent=label(context())}
window.addEventListener('DOMContentLoaded',()=>{
 build();syncContext();welcome();
 $('#tbAiLauncher').onclick=()=>{$('#tbAiPanel').hidden=false;syncContext();setTimeout(()=>$('#tbAiInput').focus(),40)};
 $('#tbAiClose').onclick=()=>$('#tbAiPanel').hidden=true;
 $('#tbAiForm').onsubmit=e=>{e.preventDefault();send($('#tbAiInput').value)};
 $('#tbAiInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#tbAiForm').requestSubmit()}});
 if(!ON_GITHUB_PAGES)$('#tbAiCheck').onclick=checkConnection;
 $('#tbAiPortfolio').onclick=()=>localAction('portfolio');
 $('#tbAiAudit').onclick=()=>localAction('audit');
 $('#tbAiDocs').onclick=()=>localAction('docs');
 $('#tbAiProposal').onclick=prepareChange;
 $('#tbAiCouncil').onclick=runCouncil;
 window.addEventListener('thermabot:navigate',syncContext);window.addEventListener('thermabot:render',syncContext);
});
})();