(()=>{'use strict';
if(parent===window&&window.TBDesignPreview){
  const message='Prueba local · nube desactivada';
  window.TBCloud={status:()=>message,state:()=>({phase:'preview',message,pending:false,busy:false,verified:false,updatedAt:null}),changed:()=>{},save:async()=>{},check:async()=>{}};
  window.TBCloudReady=Promise.resolve(true);return;
}
const keys=['thermabot.tracker.v1','thermabot.suite.v1','thermabot.workspace.v1','thermabot.proyectos.v1','thermabot-building-v21-trial'],pendingKey='thermabot.cloud.pending.v1';
const api=new URL('api/workspace-sync',document.currentScript.src).href;
let remote=null,busy=false,timer,message='Drive: comprobando conexión…',phase='checking',dirty=localStorage.getItem(pendingKey)==='1',generation=0;
const original=Storage.prototype.setItem;
const state=()=>({phase,message,pending:dirty,busy,verified:phase==='saved'&&!dirty,updatedAt:remote?.updatedAt||null});
function changed(){generation++;dirty=true;original.call(localStorage,pendingKey,'1');clearTimeout(timer);timer=setTimeout(save,2200);status('Cambios locales · Drive pendiente','pending');}
if(parent!==window&&parent.TBCloud){
  window.TBCloud=parent.TBCloud;window.TBCloudReady=parent.TBCloudReady;
  Storage.prototype.setItem=function(k,v){const before=this.getItem(k);original.call(this,k,v);if(this===localStorage&&keys.includes(k)&&before!==String(v))parent.TBCloud.changed();};return;
}
function status(text,nextPhase){
  message=text;if(nextPhase)phase=nextPhase;
  let badge=document.getElementById('cloudSaveStatus');
  if(!badge){badge=document.createElement('button');badge.id='cloudSaveStatus';badge.type='button';badge.style.cssText='position:fixed;bottom:12px;right:18px;z-index:9000;padding:10px 14px;border-radius:12px;border:1px solid #4b8b79;background:#173e33;color:white;max-width:460px;text-align:left';badge.setAttribute('role','status');badge.onclick=()=>check();document.body.append(badge);}
  badge.textContent=text;badge.dataset.cloudPhase=phase;
  window.dispatchEvent(new CustomEvent('thermabot:cloud-status',{detail:text}));
  window.dispatchEvent(new CustomEvent('thermabot:cloud-state',{detail:state()}));
}
async function request(options={}){
  const r=await fetch(api,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});
  if(!r.headers.get('Content-Type')?.includes('application/json'))throw Error('Drive pendiente: no se pudo establecer la conexión.');
  const data=await r.json();if(!r.ok)throw Error(data.error||'Drive no disponible');return data;
}
function localValues(){return Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null));}
function trackerScore(raw){
  try{
    const t=typeof raw==='string'?JSON.parse(raw):raw||{},projects=Array.isArray(t.projects)?t.projects:[];
    const ignore=new Set(['id','createdAt','updatedAt']);
    let score=projects.length*100;
    for(const p of projects)for(const [k,v]of Object.entries(p||{})){
      if(ignore.has(k)||v===null||v===undefined||v==='')continue;
      score+=1;
      if(k==='installedTR')score+=20;
      if(k==='installedOn'||k==='completedOn')score+=5;
    }
    return score;
  }catch{return 0;}
}
function localTrackerIsRicher(remoteRaw,localRaw){
  if(!localRaw||!remoteRaw)return false;
  return trackerScore(localRaw)>trackerScore(remoteRaw);
}
async function save(){
  if(busy)return;if(!dirty)return check();
  busy=true;const savingGeneration=generation;
  try{
    if(!remote)remote=await request();
    const values={...remote.values,...localValues()};status('Guardando en Drive…','saving');
    const result=await request({method:'PUT',headers:{'Content-Type':'application/json','X-THERMABOT-Save':'1'},body:JSON.stringify({...remote,values})});
    remote={...remote,...result,values};dirty=generation!==savingGeneration;original.call(localStorage,pendingKey,dirty?'1':'0');
    status(dirty?'Nuevos cambios pendientes de guardar':'✓ Guardado en Drive',dirty?'pending':'saved');
  }catch(e){status('Copia local · '+e.message,'error');}
  finally{busy=false;status(message,phase);if(dirty&&generation!==savingGeneration)timer=setTimeout(save,2200);}
}
// Check is read-only when clean: it never replaces edits or silently rebases a conflict.
async function check(){
  if(busy)return;if(dirty)return save();
  busy=true;const checkingGeneration=generation;status('Comprobando Drive…','checking');
  try{
    const latest=await request();
    if(remote&&latest.revision!==remote.revision)status('Hay cambios de otro dispositivo · recargá para recibirlos','remote-change');
    else{remote=latest;status(generation!==checkingGeneration||dirty?'Cambios locales · Drive pendiente':'✓ Base verificada en Drive',dirty?'pending':'saved');}
  }catch(e){status('Copia local · '+e.message,'error');}
  finally{busy=false;status(message,phase);if(dirty)timer=setTimeout(save,2200);}
}
Storage.prototype.setItem=function(k,v){const before=this.getItem(k);original.call(this,k,v);if(this===localStorage&&keys.includes(k)&&before!==String(v))changed();};
window.TBCloud={status:()=>message,state,save,check,changed};
window.TBCloudReady=(async()=>{
  try{
    remote=await request();
    if(dirty&&remote.revision==='initial'&&remote.values['thermabot.tracker.v1']){
      const incoming=JSON.parse(remote.values['thermabot.tracker.v1']),local=JSON.parse(localStorage.getItem('thermabot.tracker.v1')||'{}');
      for(const collection of ['projects','equipment','milestones','documents']){const ids=new Set((incoming[collection]||[]).map(x=>x.id));incoming[collection]=[...(incoming[collection]||[]),...(local[collection]||[]).filter(x=>!ids.has(x.id))];}
      original.call(localStorage,'thermabot.tracker.v1',JSON.stringify(incoming));
    }
    let protectedLocal=false;
    if(!dirty){
      const remoteTracker=remote.values['thermabot.tracker.v1'],localTracker=localStorage.getItem('thermabot.tracker.v1');
      protectedLocal=localTrackerIsRicher(remoteTracker,localTracker);
      if(protectedLocal){
        original.call(localStorage,'thermabot.tracker.previous.v1',localTracker);
        dirty=true;generation++;original.call(localStorage,pendingKey,'1');
      }
      for(const[k,v]of Object.entries(remote.values))if(keys.includes(k)&&typeof v==='string'&&!(protectedLocal&&k==='thermabot.tracker.v1'))original.call(localStorage,k,v);
    }
    status(protectedLocal?'Se conservó la base local más completa · Drive pendiente':dirty?'Cambios locales pendientes de guardar en Drive':'✓ Base cargada desde Drive',protectedLocal||dirty?'pending':'saved');
  }catch(e){status('Copia local · '+e.message,'error');}
  if(dirty&&remote)timer=setTimeout(save,1000);return true;
})();
setInterval(()=>{if(!busy&&!dirty&&remote)check();},60000);
window.addEventListener('online',()=>check());
})();
