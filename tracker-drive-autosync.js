(() => {
  'use strict';

  const STORAGE_KEY = 'thermabot.tracker.v1';
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

  const state = {
    mode:null,
    connected:false,
    syncing:false,
    suppressHook:false,
    pushTimer:null,
    pollTimer:null,
    uiTimer:null,
    lastSync:null,
    lastRemoteUpdatedAt:null,
    backendError:null,
    token:null,
    tokenClient:null,
  };

  const $ = id => document.getElementById(id);
  const safeParse = text => { try { const v=JSON.parse(text||'null'); return v && typeof v==='object' ? v : null; } catch { return null; } };
  const blankState = () => ({schemaVersion:1,updatedAt:new Date().toISOString(),projects:[],equipment:[],milestones:[],documents:[]});
  function normalize(raw){
    const v=raw && typeof raw==='object' ? raw : blankState();
    return {...v,schemaVersion:Number(v.schemaVersion||1),updatedAt:v.updatedAt||new Date().toISOString(),projects:Array.isArray(v.projects)?v.projects:[],equipment:Array.isArray(v.equipment)?v.equipment:[],milestones:Array.isArray(v.milestones)?v.milestones:[],documents:Array.isArray(v.documents)?v.documents:[]};
  }
  const localState = () => normalize(safeParse(localStorage.getItem(STORAGE_KEY)));
  const stateCounts = value => { const v=normalize(value); return {projects:v.projects.length,equipment:v.equipment.length,milestones:v.milestones.length,documents:v.documents.length}; };
  const sameState = (a,b) => JSON.stringify(normalize(a))===JSON.stringify(normalize(b));

  function setMessage(message,type=''){
    const el=$('driveMessage'); if(!el)return; el.textContent=message; el.className=`drive-message ${type}`.trim();
  }
  function setLocal(remote){ state.suppressHook=true; try{localStorage.setItem(STORAGE_KEY,JSON.stringify(normalize(remote)));} finally{state.suppressHook=false;} }

  function updateUi(){
    const quick=$('driveQuickBtn');
    if(quick){ quick.textContent=state.connected ? 'Google Sheets ✓' : 'Google Sheets'; quick.classList.toggle('dark',state.connected); }
    if($('driveStateTitle')) $('driveStateTitle').textContent=state.connected ? 'Google Sheets · base maestra' : 'Google Sheets sin conexión';
    if($('driveFolderState')) $('driveFolderState').textContent='THERMABOT / Seguimiento';
    if($('driveFileState')) $('driveFileState').textContent='THERMABOT - Seguimiento de Proyectos';
    if($('driveSyncState')) $('driveSyncState').textContent=state.lastSync ? state.lastSync.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
    if($('driveModeState')) $('driveModeState').textContent=state.connected ? (state.mode==='server'?'Sheets permanente + copia local':'Sheets + copia local') : 'Copia local';
    if($('pushDriveBtn')) $('pushDriveBtn').disabled=!state.connected||state.syncing;
    if($('pullDriveBtn')) $('pullDriveBtn').disabled=!state.connected||state.syncing;
    if($('connectDriveBtn')){ $('connectDriveBtn').disabled=state.syncing; $('connectDriveBtn').textContent=state.connected?'Verificar Google Sheets':'Conectar Google Sheets'; }
    const link=$('openDriveFolder'); if(link){link.href=SPREADSHEET_URL;link.textContent='Abrir planilla';link.classList.remove('disabled');}
    const input=$('driveClientId');
    if(input?.closest('label')) input.closest('label').style.display=state.mode==='server'?'none':'';
    if($('saveDriveClientBtn')) $('saveDriveClientBtn').style.display=state.mode==='server'?'none':'';
  }

  async function apiFetch(url=API_URL,options={}){
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{...(options.headers||{}),'Accept':'application/json'}});
    let payload=null; try{payload=await response.json();}catch{}
    if(!response.ok){const e=new Error(payload?.error||`Servidor: HTTP ${response.status}`);e.status=response.status;e.payload=payload;throw e;}
    return payload;
  }
  async function probeServer(){
    const info=await apiFetch(`${API_URL}?status=1`);
    if(info?.ok!==true||info?.mode!=='google-sheets-master') throw new Error('Backend Google Sheets no disponible.');
    state.mode='server';state.connected=true;state.backendError=null;state.lastRemoteUpdatedAt=info.updatedAt||null;return info;
  }

  function getClientId(){return (localStorage.getItem(CLIENT_KEY)||'').trim();}
  async function waitGoogle(timeout=12000){const start=Date.now();while(Date.now()-start<timeout){if(window.google?.accounts?.oauth2)return true;await new Promise(r=>setTimeout(r,150));}return false;}
  function buildTokenClient(){const id=getClientId();if(!id||!window.google?.accounts?.oauth2)return null;return google.accounts.oauth2.initTokenClient({client_id:id,scope:SHEETS_SCOPE,callback:()=>{}});}
  async function acquireBrowserToken(interactive=false){
    if(!getClientId()) throw new Error('Falta configurar el Google OAuth Client ID.');
    if(!await waitGoogle()) throw new Error('Google Identity todavía no terminó de cargar.');
    return new Promise((resolve,reject)=>{
      const client=buildTokenClient();if(!client)return reject(new Error('No se pudo iniciar Google Sheets.'));
      state.tokenClient=client;
      client.callback=response=>{if(response?.error||!response?.access_token)return reject(new Error(response?.error||'Autenticación cancelada.'));state.token=response.access_token;state.mode='browser';state.connected=true;resolve(state.token);};
      try{client.requestAccessToken({prompt:interactive?'consent':''});}catch(err){reject(err);}
    });
  }
  async function sheetsFetch(url,options={},retry=true){
    if(!state.token) await acquireBrowserToken(false);
    const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${state.token}`);
    const response=await fetch(url,{...options,headers});
    if(response.status===401&&retry){state.token=null;await acquireBrowserToken(false);return sheetsFetch(url,options,false);}
    if(!response.ok){const detail=await response.text().catch(()=> '');throw new Error(`Google Sheets ${response.status}: ${detail.slice(0,240)}`);}return response;
  }
  function rowsToObjects(values=[]){if(!values.length)return[];const headers=values[0].map(v=>String(v??'').trim());return values.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='' )).map(r=>{const o={};headers.forEach((h,i)=>{if(h)o[h]=r[i]??'';});return o;});}
  function configMap(values=[]){const o={};for(const r of values.slice(1))if(r?.[0])o[String(r[0])]=r[1]??'';return o;}
  function objectsToValues(headers,rows){return [headers,...rows.map(r=>headers.map(h=>r?.[h]??''))];}

  async function directRead(){
    const ranges=[SCHEMAS.projects.range,SCHEMAS.equipment.range,SCHEMAS.milestones.range,SCHEMAS.documents.range,'Configuracion!A1:B100'];
    const params=ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join('&');
    const response=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
    const payload=await response.json(); const vr=payload.valueRanges||[];
    const cfg=configMap(vr[4]?.values||[]);
    return normalize({schemaVersion:Number(cfg.schemaVersion||1),updatedAt:String(cfg.updatedAt||new Date().toISOString()),importSource:String(cfg.importSource||'Google Sheets'),projects:rowsToObjects(vr[0]?.values||[]).map(p=>({...p,progress:Number(p.progress||0)})),equipment:rowsToObjects(vr[1]?.values||[]),milestones:rowsToObjects(vr[2]?.values||[]),documents:rowsToObjects(vr[3]?.values||[]),trackerMetadata:{sourceOfTruth:'Google Sheets',spreadsheetId:SPREADSHEET_ID}});
  }
  async function directWrite(local,{force=false}={}){
    const incoming=normalize(local); const current=await directRead(); const ic=stateCounts(incoming),rc=stateCounts(current);
    if(!force && rc.projects>=5 && ic.projects<=1){const e=new Error('Protección activa: se rechazó reducir la cartera a uno o cero proyectos.');e.status=409;throw e;}
    incoming.updatedAt=new Date().toISOString();
    const clearRanges=['Proyectos!A1:W1000','Equipos!A1:J1000','Hitos!A1:H1000','Documentos!A1:H1000','Configuracion!A1:B100'];
    await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchClear`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ranges:clearRanges})});
    const c=stateCounts(incoming);
    const config=[['Clave','Valor'],['schemaVersion',1],['updatedAt',incoming.updatedAt],['importSource',incoming.importSource||'THERMABOT / Google Sheets'],['sourceOfTruth','Google Sheets'],['spreadsheetId',SPREADSHEET_ID],['projects',c.projects],['equipment',c.equipment],['milestones',c.milestones],['documents',c.documents]];
    const data=[
      {range:'Proyectos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.projects.headers,incoming.projects)},
      {range:'Equipos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.equipment.headers,incoming.equipment)},
      {range:'Hitos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.milestones.headers,incoming.milestones)},
      {range:'Documentos!A1',majorDimension:'ROWS',values:objectsToValues(SCHEMAS.documents.headers,incoming.documents)},
      {range:'Configuracion!A1',majorDimension:'ROWS',values:config},
    ];
    await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data})});
    const hr=encodeURIComponent('Historial!A:D');
    await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${hr}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[new Date().toISOString(),'THERMABOT Web','Sincronización',`Guardados ${c.projects} proyectos, ${c.equipment} equipos, ${c.milestones} hitos y ${c.documents} documentos.`]]})});
    return {ok:true,mode:'browser-sheets',updatedAt:incoming.updatedAt,counts:c};
  }

  async function readRemote(){return state.mode==='server'?normalize(await apiFetch(API_URL)):directRead();}
  async function writeRemote(local,{force=false}={}){if(state.mode==='server'){return apiFetch(force?`${API_URL}?force=1`:API_URL,{method:'PUT',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(normalize(local))});}return directWrite(local,{force});}

  async function pull({reload=true,announce=true}={}){
    if(!state.connected||state.syncing)return false;state.syncing=true;updateUi();
    try{if(announce)setMessage('Leyendo la cartera maestra desde Google Sheets…');const remote=await readRemote();const local=localState();state.lastRemoteUpdatedAt=remote.updatedAt;state.lastSync=new Date();if(!sameState(remote,local)){setLocal(remote);setMessage(`Google Sheets cargado: ${stateCounts(remote).projects} proyectos.`,'ok');if(reload)setTimeout(()=>location.reload(),100);return true;}setMessage(`Google Sheets sincronizado: ${stateCounts(remote).projects} proyectos.`,'ok');return false;}finally{state.syncing=false;updateUi();}
  }
  async function push({announce=false}={}){
    if(!state.connected||state.syncing||state.suppressHook)return false;state.syncing=true;updateUi();
    try{const local=localState();if(announce)setMessage('Guardando cambios en Google Sheets…');const result=await writeRemote(local);state.lastSync=new Date();state.lastRemoteUpdatedAt=result?.updatedAt||local.updatedAt;setMessage(`Guardado en Sheets: ${result?.counts?.projects??local.projects.length} proyectos.`,'ok');return true;}catch(error){if(error.status===409){setMessage(`${error.message} Se restaurará Google Sheets.`,'error');setTimeout(()=>pull({reload:true,announce:false}).catch(()=>{}),400);return false;}throw error;}finally{state.syncing=false;updateUi();}
  }
  function schedulePush(){if(!state.connected||state.syncing||state.suppressHook)return;clearTimeout(state.pushTimer);state.pushTimer=setTimeout(()=>push().catch(e=>setMessage(`No se pudo guardar en Sheets: ${e.message}`,'error')),PUSH_DELAY_MS);}
  function hookLocalStorage(){if(window.__THERMABOT_SHEETS_HOOK__)return;window.__THERMABOT_SHEETS_HOOK__=true;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){const result=original.call(this,key,value);if(this===localStorage&&key===STORAGE_KEY&&!state.suppressHook)schedulePush();return result;};}

  async function poll(){if(!state.connected||state.syncing||document.hidden)return;try{const remote=await readRemote();const local=localState();if(new Date(remote.updatedAt).getTime()>new Date(local.updatedAt).getTime())await pull({reload:true,announce:false});state.lastSync=new Date();updateUi();}catch(error){state.connected=false;state.backendError=error;updateUi();setMessage(`Sincronización interrumpida: ${error.message}`,'error');}}
  function startPolling(){clearInterval(state.pollTimer);state.pollTimer=setInterval(poll,POLL_MS);}

  function overrideControls(){
    const driveNav=document.querySelector('[data-view="drive"]');
    if($('driveQuickBtn'))$('driveQuickBtn').onclick=()=>{if(driveNav)driveNav.click();setTimeout(updateUi,20);};
    if($('connectDriveBtn'))$('connectDriveBtn').onclick=()=>initialize({manual:true,interactive:true});
    if($('pushDriveBtn'))$('pushDriveBtn').onclick=()=>push({announce:true}).catch(e=>setMessage(e.message,'error'));
    if($('pullDriveBtn'))$('pullDriveBtn').onclick=()=>{if(confirm('¿Cargar la cartera maestra desde Google Sheets?'))pull({reload:true,announce:true}).catch(e=>setMessage(e.message,'error'));};
    if($('saveDriveClientBtn'))$('saveDriveClientBtn').onclick=()=>{const v=$('driveClientId')?.value?.trim()||'';if(v)localStorage.setItem(CLIENT_KEY,v);else localStorage.removeItem(CLIENT_KEY);setMessage(v?'Client ID guardado. Ya podés conectar Google Sheets.':'Client ID eliminado.',v?'ok':'');};
    if(driveNav)driveNav.addEventListener('click',()=>setTimeout(updateUi,30));
  }

  async function initialize({manual=false,interactive=false}={}){
    if(state.syncing)return;state.syncing=true;updateUi();
    try{
      try{await probeServer();}
      catch(serverError){state.backendError=serverError;state.mode=null;state.connected=false;if(!getClientId())throw serverError;await acquireBrowserToken(interactive||manual);}
      state.syncing=false;overrideControls();updateUi();if(!state.uiTimer)state.uiTimer=setInterval(updateUi,1500);
      await pull({reload:true,announce:false});state.connected=true;state.lastSync=new Date();startPolling();updateUi();
    }catch(error){state.syncing=false;state.connected=false;updateUi();if(manual)setMessage(`No se pudo conectar Google Sheets: ${error.message}`,'error');else setMessage('Google Sheets está configurado como base maestra. Si hace falta autorización, usá “Conectar Google Sheets” una sola vez.','');}
  }

  async function init(){hookLocalStorage();overrideControls();updateUi();await initialize({manual:false,interactive:false});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,100));else setTimeout(init,100);
})();
