(() => {
  'use strict';

  const STORAGE_KEY = 'thermabot.tracker.v1';
  const DIRTY_KEY = 'thermabot.tracker.pending.v1';
  const BASE_KEY = 'thermabot.tracker.sync-base.v1';
  const CLIENT_KEY = 'thermabot.drive.client_id';
  const API_URL = './api/tracker-sync';
  const SPREADSHEET_ID = '1EhdGZwuo3t8k_Y32tVbYEtUTjjOBbo88eyK7OFXEXBs';
  const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
  const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const POLL_MS = 60000;
  const PUSH_DELAY_MS = 1200;

  const SCHEMAS = {
    projects:{sheet:'Proyectos',range:'A1:W1000',headers:['id','establishment','name','sector','system','priority','stage','status','progress','owner','targetDate','lastMove','nextAction','blocker','specRevision','drawingRevision','supplier','expediente','notes','sourceDriveUrl','sourceBalanceId','createdAt','updatedAt']},
    equipment:{sheet:'Equipos',range:'A1:J1000',headers:['id','projectId','name','model','capacity','location','status','supplier','tag','notes']},
    milestones:{sheet:'Hitos',range:'A1:H1000',headers:['id','projectId','title','type','dueDate','status','owner','notes']},
    documents:{sheet:'Documentos',range:'A1:H1000',headers:['id','projectId','type','title','revision','status','driveUrl','updatedAt']},
  };

  function safeStoredBase(){ try { return JSON.parse(localStorage.getItem(BASE_KEY)||'null'); } catch { return null; } }
  const state = {
    mode:null,
    connected:false,
    syncing:false,
    suppressHook:false,
    pushTimer:null,
    pollTimer:null,
    uiTimer:null,
    lastSync:null,
    token:null,
    backendError:null,
    remoteSnapshot:safeStoredBase(),
    conflict:false,
    retryMs:2000,
  };

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const safeParse = text => { try { const v=JSON.parse(text||'null'); return v && typeof v==='object' ? v : null; } catch { return null; } };
  const blankState = () => ({schemaVersion:1,updatedAt:new Date().toISOString(),projects:[],equipment:[],milestones:[],documents:[]});
  function normalize(raw){
    const v=raw && typeof raw==='object' ? raw : blankState();
    return {...v,schemaVersion:Number(v.schemaVersion||1),updatedAt:v.updatedAt||new Date().toISOString(),projects:Array.isArray(v.projects)?v.projects:[],equipment:Array.isArray(v.equipment)?v.equipment:[],milestones:Array.isArray(v.milestones)?v.milestones:[],documents:Array.isArray(v.documents)?v.documents:[]};
  }
  const localState = () => normalize(safeParse(localStorage.getItem(STORAGE_KEY)));
  const stateCounts = value => { const v=normalize(value); return {projects:v.projects.length,equipment:v.equipment.length,milestones:v.milestones.length,documents:v.documents.length}; };
  const sameState = (a,b) => ['projects','equipment','milestones','documents'].every(k => JSON.stringify(normalize(a)[k]) === JSON.stringify(normalize(b)[k]));
  const hasPending = () => localStorage.getItem(DIRTY_KEY) === '1';

  function setMessage(message,type=''){
    const el=$('driveMessage');
    if(!el) return;
    el.textContent=message;
    el.className=`drive-message ${type}`.trim();
  }

  function setLocal(remote){
    state.suppressHook=true;
    try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(normalize(remote))); }
    finally{ state.suppressHook=false; }
  }

  function getClientId(){ return (localStorage.getItem(CLIENT_KEY)||'').trim(); }

  function updateUi(){
    const pending=hasPending();
    const status=state.conflict?'Necesita revisión · cambios conservados':state.syncing?'Guardando / verificando…':pending?'Pendiente de guardar en Drive':state.connected?'Guardado en Drive':'Copia local · Drive desconectado';
    if($('trackerSaveStatus')) $('trackerSaveStatus').textContent=status;

    const quick=$('driveQuickBtn');
    if(quick){ quick.textContent=status; quick.classList.toggle('dark',state.connected); }
    if($('driveStateTitle')) $('driveStateTitle').textContent=state.connected?'Google Sheets · base maestra':'Google Sheets sin conexión';
    if($('driveFolderState')) $('driveFolderState').textContent='THERMABOT / Seguimiento';
    if($('driveFileState')) $('driveFileState').textContent='THERMABOT - Seguimiento de Proyectos';
    if($('driveSyncState')) $('driveSyncState').textContent=state.lastSync?state.lastSync.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'—';
    if($('driveModeState')) $('driveModeState').textContent=state.connected?(state.mode==='server'?'Sheets permanente + copia local':'Sheets + copia local'):'Copia local';
    if($('pushDriveBtn')) $('pushDriveBtn').disabled=!state.connected||state.syncing;
    if($('pullDriveBtn')) $('pullDriveBtn').disabled=!state.connected||state.syncing;
    if($('connectDriveBtn')){
      $('connectDriveBtn').disabled=state.syncing;
      $('connectDriveBtn').textContent=state.connected?'Verificar Google Sheets':'Conectar Google Sheets';
    }
    const link=$('openDriveFolder');
    if(link){ link.href=SPREADSHEET_URL; link.textContent='Abrir planilla'; link.classList.remove('disabled'); }
    const input=$('driveClientId');
    if(input && document.activeElement!==input) input.value=getClientId();
    if(input?.closest('label')) input.closest('label').style.display=state.mode==='server'?'none':'';
    if($('saveDriveClientBtn')) $('saveDriveClientBtn').style.display=state.mode==='server'?'none':'';
  }

  async function apiFetch(url=API_URL,options={}){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{...(options.headers||{}),'Accept':'application/json'}});
    let payload=null;
    try{ payload=await response.json(); }catch{}
    if(!response.ok){ const e=new Error(payload?.error||`Servidor: HTTP ${response.status}`); e.status=response.status; e.payload=payload; throw e; }
    return payload;
  }

  async function probeServer(){
    const info=await apiFetch(`${API_URL}?status=1`);
    if(info?.ok!==true||info?.mode!=='google-sheets-master') throw new Error('Backend Google Sheets no disponible.');
    state.mode='server';
    state.connected=true;
    state.backendError=null;
    return info;
  }

  async function waitGoogle(timeout=12000){
    const start=Date.now();
    while(Date.now()-start<timeout){
      if(window.google?.accounts?.oauth2) return true;
      await sleep(150);
    }
    return false;
  }

  async function acquireBrowserToken(){
    const clientId=getClientId();
    if(!clientId) throw new Error('Primero guardá el Google OAuth Client ID.');
    if(!await waitGoogle()) throw new Error('No se cargó Google Identity. Recargá la página y reintentá.');

    return new Promise((resolve,reject)=>{
      let settled=false;
      const finishError=msg=>{ if(settled)return; settled=true; reject(new Error(msg)); };
      const finishOk=token=>{ if(settled)return; settled=true; resolve(token); };
      let client;
      try{
        client=google.accounts.oauth2.initTokenClient({
          client_id:clientId,
          scope:SHEETS_SCOPE,
          callback:response=>{
            if(response?.error||!response?.access_token) return finishError(response?.error_description||response?.error||'Autenticación cancelada.');
            state.token=response.access_token;
            state.mode='browser';
            state.connected=true;
            finishOk(state.token);
          },
          error_callback:error=>finishError(error?.message||error?.type||'Google no pudo abrir la ventana de autorización. Revisá los pop-ups del navegador.'),
        });
        client.requestAccessToken({prompt:'consent'});
      }catch(err){ finishError(err?.message||String(err)); }
    });
  }

  async function sheetsFetch(url,options={}){
    if(!state.token) throw new Error('La sesión de Google Sheets no está autorizada. Tocá “Conectar Google Sheets”.');
    const headers=new Headers(options.headers||{});
    headers.set('Authorization',`Bearer ${state.token}`);
    const response=await fetch(url,{...options,headers});
    if(response.status===401){
      state.token=null; state.connected=false; updateUi();
      throw new Error('La autorización de Google venció. Tocá “Conectar Google Sheets” nuevamente.');
    }
    if(!response.ok){ const detail=await response.text().catch(()=> ''); throw new Error(`Google Sheets ${response.status}: ${detail.slice(0,240)}`); }
    return response;
  }

  function rowsToObjects(values=[]){
    if(!values.length) return [];
    const headers=values[0].map(v=>String(v??'').trim());
    return values.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map(r=>{const o={};headers.forEach((h,i)=>{if(h)o[h]=r[i]??'';});return o;});
  }
  function configMap(values=[]){ const o={}; for(const r of values.slice(1)) if(r?.[0]) o[String(r[0])]=r[1]??''; return o; }
  function objectsToValues(headers,rows){ return [headers,...rows.map(r=>headers.map(h=>r?.[h]??''))]; }

  async function directRead(){
    const ranges=[...Object.values(SCHEMAS).map(s => `${s.sheet}!${s.range}`),'Configuracion!A1:B100'];
    const params=ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join('&');
    const response=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
    const payload=await response.json();
    const vr=payload.valueRanges||[];
    const cfg=configMap(vr[4]?.values||[]);
    return normalize({
      schemaVersion:Number(cfg.schemaVersion||1),
      updatedAt:String(cfg.updatedAt||new Date().toISOString()),
      importSource:String(cfg.importSource||'Google Sheets'),
      projects:rowsToObjects(vr[0]?.values||[]).map(p=>({...p,progress:Number(p.progress||0)})),
      equipment:rowsToObjects(vr[1]?.values||[]),
      milestones:rowsToObjects(vr[2]?.values||[]),
      documents:rowsToObjects(vr[3]?.values||[]),
      trackerMetadata:{sourceOfTruth:'Google Sheets',spreadsheetId:SPREADSHEET_ID},
    });
  }


  async function atomicSheetWrite(data){
    const response=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`);
    const metadata=await response.json();
    const requests=data.map(item=>{
      const title=item.range.split('!')[0];
      const sheet=metadata.sheets.find(s=>s.properties.title===title)?.properties;
      if(!sheet) throw new Error(`Falta la pestaña ${title}.`);
      return {updateCells:{range:{sheetId:sheet.sheetId,startRowIndex:0,startColumnIndex:0,endColumnIndex:item.values[0].length},
        rows:item.values.map(row=>({values:row.map(value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')}}))})),
        fields:'userEnteredValue'}};
    });
    await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests})});
  }

  async function directWrite(local,{force=false}={}){
    const incoming=normalize(local);
    const current=await directRead();
    const ic=stateCounts(incoming), rc=stateCounts(current);
    if(!force && rc.projects>=5 && ic.projects<=1){ const e=new Error('Protección activa: se rechazó reducir la cartera a uno o cero proyectos.'); e.status=409; throw e; }
    incoming.updatedAt=new Date().toISOString();

    const c=stateCounts(incoming);
    const config=[['Clave','Valor'],['schemaVersion',1],['updatedAt',incoming.updatedAt],['importSource',incoming.importSource||'THERMABOT / Google Sheets'],['sourceOfTruth','Google Sheets'],['spreadsheetId',SPREADSHEET_ID],['projects',c.projects],['equipment',c.equipment],['milestones',c.milestones],['documents',c.documents]];
    const data=[
      {range:'Proyectos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.projects.headers,incoming.projects)},
      {range:'Equipos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.equipment.headers,incoming.equipment)},
      {range:'Hitos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.milestones.headers,incoming.milestones)},
      {range:'Documentos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.documents.headers,incoming.documents)},
      {range:'Configuracion!A1',majorDimension:'ROWS',values:config},
    ];
    await atomicSheetWrite(data);

    const hr=encodeURIComponent('Historial!A:D');
    await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${hr}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[new Date().toISOString(),'THERMABOT Web','Sincronización',`Guardados ${c.projects} proyectos, ${c.equipment} equipos, ${c.milestones} hitos y ${c.documents} documentos.`]]})});
    return {ok:true,mode:'browser-sheets',updatedAt:incoming.updatedAt,counts:c};
  }

  async function readRemote(){ return state.mode==='server'?normalize(await apiFetch(API_URL)):directRead(); }
  async function writeRemote(local,{force=false}={}){
    if(state.mode==='server') return apiFetch(force?`${API_URL}?force=1`:API_URL,{method:'PUT',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(normalize(local))});
    return directWrite(local,{force});
  }

  async function pull({reload=true,announce=true}={}){
    if(!state.connected||state.syncing) return false;
    state.syncing=true; updateUi();
    try{
      if(announce) setMessage('Leyendo la cartera maestra desde Google Sheets…');
      const remote=await readRemote();
      const local=localState();
      if(!state.remoteSnapshot && !sameState(remote,local) && Object.values(stateCounts(local)).some(n=>n>0)) localStorage.setItem(DIRTY_KEY,'1');
      if(!hasPending()) { state.remoteSnapshot=remote; localStorage.setItem(BASE_KEY,JSON.stringify(remote)); }
      else if(!state.remoteSnapshot || !sameState(remote,state.remoteSnapshot)) state.conflict=true;
      state.lastSync=new Date();
      if(sameState(remote,local)) { localStorage.removeItem(DIRTY_KEY); state.conflict=false; state.remoteSnapshot=remote; localStorage.setItem(BASE_KEY,JSON.stringify(remote)); }
      if(!sameState(remote,local)){
        if(hasPending()) { setMessage('Hay cambios locales pendientes. No se reemplazaron con la nube. Usá Guardar ahora después de revisar la planilla.', 'error'); return false; }
        localStorage.setItem('thermabot.tracker.previous.v1', JSON.stringify(local));
        setLocal(remote);
        setMessage(`Google Sheets cargado: ${stateCounts(remote).projects} proyectos.`,'ok');
        if(reload) setTimeout(()=>location.reload(),150);
        return true;
      }
      setMessage(`Google Sheets sincronizado: ${stateCounts(remote).projects} proyectos.`,'ok');
      return false;
    }finally{ state.syncing=false; updateUi(); }
  }

  async function push({announce=false}={}){
    if(!state.connected||state.syncing||state.suppressHook) return false;
    state.syncing=true; updateUi();
    try{
      const local=localState();
      if(announce) setMessage('Guardando cambios en Google Sheets…');
      const remote=await readRemote();
      if(!state.remoteSnapshot || !sameState(remote,state.remoteSnapshot)) { const e=new Error('La nube cambió o falta una versión verificada. Revisá ambas copias antes de guardar.'); e.status=409; throw e; }
      const result=await writeRemote(local);
      const verified=await readRemote();
      if(!sameState(local,verified)) { const e=new Error('La copia de Drive no coincide con los cambios enviados.'); e.status=409; throw e; }
      state.remoteSnapshot=verified;
      localStorage.setItem(BASE_KEY,JSON.stringify(verified));
      state.retryMs=2000; state.conflict=false;
      if(sameState(local,localState())) localStorage.removeItem(DIRTY_KEY);
      state.lastSync=new Date();
      setMessage(`Guardado en Sheets: ${result?.counts?.projects??local.projects.length} proyectos.`,'ok');
      return true;
    }catch(error){
      if(error.status===409){ state.conflict=true; setMessage(`${error.message} Tus cambios locales se conservaron.`, 'error'); return false; }
      state.retryMs=Math.min(state.retryMs*2,60000);
      throw error;
    }finally{ state.syncing=false; updateUi(); if(hasPending() && state.connected && !state.conflict) schedulePush(state.retryMs); }
  }

  function schedulePush(delay=PUSH_DELAY_MS){
    if(!state.connected||state.syncing||state.suppressHook||state.conflict) return;
    clearTimeout(state.pushTimer);
    state.pushTimer=setTimeout(()=>push().catch(e=>setMessage(`No se pudo guardar en Sheets: ${e.message}`,'error')),delay);
  }

  function hookLocalStorage(){
    if(window.__THERMABOT_SHEETS_HOOK__) return;
    window.__THERMABOT_SHEETS_HOOK__=true;
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      const result=original.call(this,key,value);
      if(this===localStorage&&key===STORAGE_KEY&&!state.suppressHook) { original.call(localStorage,DIRTY_KEY,'1'); updateUi(); schedulePush(); }
      return result;
    };
  }

  async function poll(){
    if(!state.connected||state.syncing||document.hidden) return;
    if(hasPending()) { schedulePush(); return; }
    try{
      const remote=await readRemote();
      const local=localState();
      if(!hasPending()) { state.remoteSnapshot=remote; localStorage.setItem(BASE_KEY,JSON.stringify(remote)); }
      if(!sameState(remote,local)){
        if(hasPending() || state.syncing) return;
        localStorage.setItem('thermabot.tracker.previous.v1', JSON.stringify(local));
        setLocal(remote);
        setMessage(`Cambio detectado en Google Sheets: ${stateCounts(remote).projects} proyectos.`,'ok');
        setTimeout(()=>location.reload(),150);
        return;
      }
      state.lastSync=new Date(); updateUi();
    }catch(error){
      updateUi(); setMessage(`Sincronización interrumpida: ${error.message}`,'error');
    }
  }

  function startPolling(){ clearInterval(state.pollTimer); state.pollTimer=setInterval(poll,POLL_MS); }

  function saveClientId(){
    const v=$('driveClientId')?.value?.trim()||'';
    if(v) localStorage.setItem(CLIENT_KEY,v); else localStorage.removeItem(CLIENT_KEY);
    setMessage(v?'Client ID guardado. Ahora tocá “Conectar Google Sheets”.':'Client ID eliminado.',v?'ok':'');
    updateUi();
  }

  async function connectManually(){
    if(state.syncing) return;
    state.syncing=true; updateUi(); setMessage('Abriendo autorización de Google…');
    try{
      try{
        await probeServer();
      }catch(serverError){
        state.backendError=serverError;
        state.mode=null;
        state.connected=false;
        await acquireBrowserToken();
      }
      state.syncing=false; updateUi();
      await pull({reload:true,announce:true});
      state.connected=true; state.lastSync=new Date(); startPolling(); updateUi(); if(hasPending()) schedulePush();
    }catch(error){
      state.syncing=false; state.connected=false; updateUi();
      setMessage(`No se pudo conectar Google Sheets: ${error.message}`,'error');
    }
  }

  function downloadRecovery(){
    const payload={exportedAt:new Date().toISOString(),current:localState(),previous:safeParse(localStorage.getItem('thermabot.tracker.previous.v1')),syncBase:safeStoredBase(),pending:hasPending()};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download='THERMABOT-recuperacion-'+new Date().toISOString().slice(0,10)+'.json'; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function overrideControls(){
    if($('downloadRecoveryBtn')) $('downloadRecoveryBtn').onclick=downloadRecovery;
    const driveNav=document.querySelector('[data-view="drive"]');
    if($('driveQuickBtn')) $('driveQuickBtn').onclick=()=>{ if(driveNav) driveNav.click(); setTimeout(updateUi,20); };
    if($('saveDriveClientBtn')) $('saveDriveClientBtn').onclick=saveClientId;
    if($('connectDriveBtn')) $('connectDriveBtn').onclick=connectManually;
    if($('pushDriveBtn')) $('pushDriveBtn').onclick=()=>push({announce:true}).catch(e=>setMessage(e.message,'error'));
    if($('pullDriveBtn')) $('pullDriveBtn').onclick=()=>{ if(confirm('¿Cargar la cartera maestra desde Google Sheets?')) pull({reload:true,announce:true}).catch(e=>setMessage(e.message,'error')); };
    if(driveNav) driveNav.addEventListener('click',()=>setTimeout(updateUi,30));
  }

  async function init(){
    hookLocalStorage();
    overrideControls();
    updateUi();

    // En GitHub Pages no existe el backend de Cloudflare. No intentamos abrir
    // OAuth automáticamente al cargar, porque el navegador puede bloquear el popup
    // y dejar el botón de conexión trabado. La autorización se inicia únicamente
    // por un clic explícito del usuario.
    try{
      await probeServer();
      updateUi();
      await pull({reload:true,announce:false});
      state.lastSync=new Date(); startPolling(); updateUi();
    }catch(error){
      state.mode=null; state.connected=false; state.syncing=false; state.backendError=error; updateUi();
      setMessage(getClientId()?'Client ID listo. Tocá “Conectar Google Sheets” para autorizar y cargar los proyectos.':'Pegá y guardá el Client ID, luego tocá “Conectar Google Sheets”.');
    }
    if(!state.uiTimer) state.uiTimer=setInterval(updateUi,1500);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,100));
  else setTimeout(init,100);
})();