(()=>{'use strict';
const STORAGE='thermabot.tracker.v1';
const HISTORY='thermabot.ai.history.v1';
const $=s=>document.querySelector(s);
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
  <div class="tb-ai-messages" id="tbAiMessages"></div>
  <form class="tb-ai-form" id="tbAiForm"><div class="tb-ai-box"><textarea class="tb-ai-input" id="tbAiInput" rows="1" placeholder="Preguntá sobre tus proyectos…"></textarea><button class="tb-ai-send" id="tbAiSend" type="submit" aria-label="Enviar">↑</button></div><div class="tb-ai-foot">V1 · consulta y análisis · no modifica datos</div></form>
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
async function send(text){
 text=String(text||'').trim();if(!text)return;
 add('user',text);$('#tbAiInput').value='';$('#tbAiSend').disabled=true;const loading=add('assistant','Analizando…','loading');
 const h=loadHistory();h.push({role:'user',content:text});
 try{
  const r=await fetch('https://thermabot-ai-backend.vercel.app/api/ai-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,history:h.slice(-8),context:context()})});
  const p=await r.json().catch(()=>({}));loading.remove();
  if(!r.ok)throw new Error(p.error||('Error '+r.status));
  add('assistant',p.reply||'No recibí una respuesta.');h.push({role:'assistant',content:p.reply||''});saveHistory(h);
 }catch(e){loading.remove();add('system',e.message.includes('OPENAI_API_KEY')?'La interfaz ya está lista. Falta configurar la clave de OpenAI como secreto OPENAI_API_KEY en el backend para activar las respuestas.':'No pude consultar la IA: '+e.message)}
 finally{$('#tbAiSend').disabled=false;$('#tbAiInput').focus()}
}
function syncContext(){const el=$('#tbAiContext');if(el)el.textContent=label(context())}
window.addEventListener('DOMContentLoaded',()=>{
 build();syncContext();welcome();
 $('#tbAiLauncher').onclick=()=>{$('#tbAiPanel').hidden=false;syncContext();setTimeout(()=>$('#tbAiInput').focus(),40)};
 $('#tbAiClose').onclick=()=>$('#tbAiPanel').hidden=true;
 $('#tbAiForm').onsubmit=e=>{e.preventDefault();send($('#tbAiInput').value)};
 $('#tbAiInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#tbAiForm').requestSubmit()}});
 window.addEventListener('thermabot:navigate',syncContext);window.addEventListener('thermabot:render',syncContext);
});
})();