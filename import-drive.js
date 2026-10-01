(() => {
  'use strict';

  const CLIENT_KEY='thermabot.drive.client_id';
  const TRACKER_KEY='thermabot.tracker.v1';
  const SOURCE_KEY='thermabot.tracker.import_source.v1';
  const FILE_NAME='seguimiento-proyectos.json';
  const SCOPE='https://www.googleapis.com/auth/drive.readonly';
  const $=id=>document.getElementById(id);

  function setStatus(message,type=''){
    const el=$('status');
    el.textContent=message;
    el.className=`import-status ${type}`.trim();
  }

  function normalize(raw){
    if(!raw || typeof raw!=='object') throw new Error('El archivo no contiene un objeto JSON válido.');
    const state={
      schemaVersion:1,
      updatedAt:raw.updatedAt||new Date().toISOString(),
      projects:Array.isArray(raw.projects)?raw.projects:[],
      equipment:Array.isArray(raw.equipment)?raw.equipment:[],
      milestones:Array.isArray(raw.milestones)?raw.milestones:[],
      documents:Array.isArray(raw.documents)?raw.documents:[]
    };
    if(!state.projects.length) throw new Error('La copia encontrada no contiene proyectos.');
    return state;
  }

  async function googleFetch(url,token){
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok){
      let text=''; try{text=await response.text();}catch{}
      throw new Error(`Google Drive respondió ${response.status}${text?`: ${text.slice(0,160)}`:''}`);
    }
    return response;
  }

  async function findCandidates(token){
    const q=`name = '${FILE_NAME}' and trashed = false`;
    const fields='files(id,name,modifiedTime,createdTime,parents,webViewLink,size)';
    const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=modifiedTime desc`;
    const json=await (await googleFetch(url,token)).json();
    return json.files||[];
  }

  async function readCandidate(file,token){
    const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
    const raw=await (await googleFetch(url,token)).json();
    const state=normalize(raw);
    return {file,state,raw};
  }

  async function chooseBest(files,token){
    const valid=[];
    for(const file of files){
      try{
        const item=await readCandidate(file,token);
        const updated=new Date(item.state.updatedAt||file.modifiedTime||0).getTime()||0;
        const score=item.state.projects.length*1e13 + updated;
        valid.push({...item,score});
      }catch{}
    }
    valid.sort((a,b)=>b.score-a.score);
    return valid[0]||null;
  }

  function renderCounts(state){
    $('projectCount').textContent=state.projects.length;
    $('documentCount').textContent=state.documents.length;
    $('equipmentCount').textContent=state.equipment.length;
    $('milestoneCount').textContent=state.milestones.length;
  }

  function saveImported(best){
    localStorage.setItem(TRACKER_KEY,JSON.stringify(best.state));
    localStorage.setItem(SOURCE_KEY,JSON.stringify({
      fileId:best.file.id,
      fileName:best.file.name,
      modifiedTime:best.file.modifiedTime||null,
      webViewLink:best.file.webViewLink||null,
      importedAt:new Date().toISOString(),
      projects:best.state.projects.length
    }));
    renderCounts(best.state);
    $('sourceInfo').textContent=`Importado desde ${best.file.name} · ${best.state.projects.length} proyectos · ${best.state.documents.length} documentos. Última actualización del archivo: ${best.file.modifiedTime?new Date(best.file.modifiedTime).toLocaleString('es-AR'):'—'}.`;
    $('openTracker').disabled=false;
  }

  function connectAndImport(){
    const clientId=($('clientId').value||'').trim();
    if(!clientId){setStatus('Primero pegá y guardá el Google OAuth Client ID.','error');return;}
    localStorage.setItem(CLIENT_KEY,clientId);
    if(!window.google?.accounts?.oauth2){setStatus('Google Identity todavía no terminó de cargar. Esperá unos segundos y reintentá.','error');return;}

    setStatus('Abriendo autorización de Google Drive…');
    const tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:SCOPE,
      callback:async response=>{
        if(response.error){setStatus(`No se pudo autorizar Google Drive: ${response.error}`,'error');return;}
        try{
          setStatus('Buscando el inventario preparado en tu Google Drive…');
          const files=await findCandidates(response.access_token);
          if(!files.length) throw new Error(`No encontré ningún archivo llamado ${FILE_NAME} en tu Drive.`);
          setStatus(`Encontré ${files.length} copia(s). Validando cuál contiene el seguimiento más completo…`);
          const best=await chooseBest(files,response.access_token);
          if(!best) throw new Error('Encontré archivos con ese nombre, pero ninguno contiene un seguimiento válido con proyectos.');
          saveImported(best);
          setStatus(`Listo: ${best.state.projects.length} proyectos fueron cargados en THERMABOT. Ya podés abrir el seguimiento.`,`ok`);
        }catch(err){setStatus(err.message||String(err),'error');}
      }
    });
    tokenClient.requestAccessToken({prompt:'consent'});
  }

  function init(){
    const saved=localStorage.getItem(CLIENT_KEY)||'';
    $('clientId').value=saved;
    $('saveClient').onclick=()=>{
      const v=($('clientId').value||'').trim();
      if(v){localStorage.setItem(CLIENT_KEY,v);setStatus('Client ID guardado en este navegador. Ahora tocá “Conectar e importar”.','ok');}
      else{localStorage.removeItem(CLIENT_KEY);setStatus('Client ID eliminado.');}
    };
    $('connectImport').onclick=connectAndImport;
    $('openTracker').onclick=()=>{window.location.href='tracker.html';};

    try{
      const current=JSON.parse(localStorage.getItem(TRACKER_KEY)||'null');
      if(current?.projects?.length){
        renderCounts(current);
        $('openTracker').disabled=false;
        $('sourceInfo').textContent=`Este navegador ya tiene ${current.projects.length} proyectos cargados. Podés reimportar desde Drive para reemplazarlos por la copia preparada.`;
      }
    }catch{}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
