(() => {
  'use strict';

  const STORAGE_KEY = 'thermabot.tracker.v1';
  const CLIENT_KEY = 'thermabot.drive.client_id';
  const FIXED_FOLDER_ID = '1u6FTkPnQaVbA9f8FIACLTI0YsR6OPeaZ';
  const FIXED_FOLDER_URL = `https://drive.google.com/drive/folders/${FIXED_FOLDER_ID}`;
  const MASTER_FILE_NAME = 'seguimiento-proyectos.json';
  const BACKUP_FILE_NAME = 'seguimiento-proyectos.backup.json';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const AUTO_PUSH_DELAY_MS = 1800;
  const REMOTE_POLL_MS = 60000;

  const syncState = {
    token: null,
    connected: false,
    masterFileId: null,
    backupFileId: null,
    pushTimer: null,
    pollingTimer: null,
    suppressLocalHook: false,
    syncing: false,
    lastSync: null,
    tokenClient: null,
    interactiveAuthInProgress: false,
  };

  const $ = id => document.getElementById(id);
  const safeJson = text => {
    try {
      const value = JSON.parse(text || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  };
  const stateCount = obj => ['projects','equipment','milestones','documents']
    .reduce((sum,key) => sum + (Array.isArray(obj?.[key]) ? obj[key].length : 0), 0);
  const stateTime = obj => {
    const t = obj?.updatedAt ? new Date(obj.updatedAt).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  };
  const driveNameLiteral = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  function setMessage(message, type='') {
    const el = $('driveMessage');
    if (el) {
      el.textContent = message;
      el.className = `drive-message ${type}`.trim();
    }
  }

  function updateUi() {
    const quick = $('driveQuickBtn');
    if (quick) {
      quick.textContent = syncState.connected ? 'Drive sincronizado' : 'Drive desconectado';
      quick.classList.toggle('dark', syncState.connected);
    }
    if ($('driveStateTitle')) $('driveStateTitle').textContent = syncState.connected ? 'Google Drive conectado' : 'Drive desconectado';
    if ($('driveFolderState')) $('driveFolderState').textContent = 'THERMABOT / Seguimiento · carpeta fija';
    if ($('driveFileState')) $('driveFileState').textContent = syncState.masterFileId ? MASTER_FILE_NAME : 'Pendiente de conexión';
    if ($('driveSyncState')) $('driveSyncState').textContent = syncState.lastSync ? syncState.lastSync.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
    if ($('driveModeState')) $('driveModeState').textContent = syncState.connected ? 'Local + Drive automático' : 'Local';
    if ($('pushDriveBtn')) $('pushDriveBtn').disabled = !syncState.connected || syncState.syncing;
    if ($('pullDriveBtn')) $('pullDriveBtn').disabled = !syncState.connected || syncState.syncing;
    const link = $('openDriveFolder');
    if (link) {
      link.href = FIXED_FOLDER_URL;
      link.classList.remove('disabled');
    }
  }

  async function waitForGoogle(timeoutMs=12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.google?.accounts?.oauth2) return true;
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
  }

  function getClientId() {
    return (localStorage.getItem(CLIENT_KEY) || '').trim();
  }

  function buildTokenClient() {
    const clientId = getClientId();
    if (!clientId) return null;
    if (!window.google?.accounts?.oauth2) return null;
    return google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: () => {},
    });
  }

  async function acquireToken(interactive=false) {
    const clientId = getClientId();
    if (!clientId) throw new Error('Falta configurar el Google OAuth Client ID en la sección Drive.');
    if (!await waitForGoogle()) throw new Error('Google Identity no terminó de cargar.');

    return new Promise((resolve,reject) => {
      const client = buildTokenClient();
      if (!client) return reject(new Error('No se pudo inicializar Google Drive.'));
      syncState.tokenClient = client;
      client.callback = response => {
        syncState.interactiveAuthInProgress = false;
        if (response?.error || !response?.access_token) {
          syncState.connected = false;
          updateUi();
          return reject(new Error(response?.error || 'Autenticación cancelada.'));
        }
        syncState.token = response.access_token;
        syncState.connected = true;
        updateUi();
        resolve(response.access_token);
      };
      try {
        syncState.interactiveAuthInProgress = interactive;
        client.requestAccessToken({prompt: interactive ? 'consent' : ''});
      } catch (err) {
        syncState.interactiveAuthInProgress = false;
        reject(err);
      }
    });
  }

  async function driveFetch(url, options={}, retry=true) {
    if (!syncState.token) await acquireToken(false);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${syncState.token}`);
    const response = await fetch(url,{...options,headers});
    if (response.status === 401 && retry) {
      syncState.token = null;
      syncState.connected = false;
      await acquireToken(false);
      return driveFetch(url,options,false);
    }
    if (!response.ok) {
      let detail='';
      try { detail = await response.text(); } catch {}
      throw new Error(`Google Drive respondió ${response.status}${detail ? `: ${detail.slice(0,180)}` : ''}`);
    }
    return response;
  }

  async function listFiles(q) {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=100`;
    const response = await driveFetch(url);
    return (await response.json()).files || [];
  }

  async function verifyFolderAccess() {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(FIXED_FOLDER_ID)}?fields=id,name,mimeType,webViewLink`;
    const response = await driveFetch(url);
    const folder = await response.json();
    if (folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error('El ID configurado no corresponde a una carpeta de Google Drive.');
    return folder;
  }

  async function findFile(name) {
    const q = `name = '${driveNameLiteral(name)}' and '${driveNameLiteral(FIXED_FOLDER_ID)}' in parents and trashed = false`;
    return (await listFiles(q))[0] || null;
  }

  async function createJsonFile(name, contentObject) {
    const boundary = 'thermabot_' + Math.random().toString(36).slice(2);
    const metadata = JSON.stringify({name,mimeType:'application/json',parents:[FIXED_FOLDER_ID]});
    const content = JSON.stringify(contentObject,null,2);
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink',{
      method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body,
    });
    return response.json();
  }

  async function writeJsonFile(fileId, contentObject) {
    const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(contentObject,null,2),
    });
    return response.json();
  }

  async function readJsonFile(fileId) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    const raw = await response.text();
    const parsed = safeJson(raw);
    if (!parsed) throw new Error('El archivo de seguimiento en Drive no contiene JSON válido.');
    return {raw,parsed};
  }

  function normalizeBackupPayload(source) {
    const parsed = typeof source === 'string' ? safeJson(source) : source;
    return {
      ...(parsed || {}),
      _backupAt: new Date().toISOString(),
      _backupSource: MASTER_FILE_NAME,
    };
  }

  async function ensureFiles() {
    await verifyFolderAccess();
    let master = await findFile(MASTER_FILE_NAME);
    if (!master) {
      const local = safeJson(localStorage.getItem(STORAGE_KEY)) || {schemaVersion:1,updatedAt:new Date().toISOString(),projects:[],equipment:[],milestones:[],documents:[]};
      master = await createJsonFile(MASTER_FILE_NAME,local);
    }
    syncState.masterFileId = master.id;
    const backup = await findFile(BACKUP_FILE_NAME);
    syncState.backupFileId = backup?.id || null;
    updateUi();
  }

  async function ensureBackupFile(remoteRaw) {
    const payload = normalizeBackupPayload(remoteRaw);
    if (!syncState.backupFileId) {
      const created = await createJsonFile(BACKUP_FILE_NAME,payload);
      syncState.backupFileId = created.id;
      return;
    }
    await writeJsonFile(syncState.backupFileId,payload);
  }

  function localState() {
    return safeJson(localStorage.getItem(STORAGE_KEY)) || {schemaVersion:1,updatedAt:new Date().toISOString(),projects:[],equipment:[],milestones:[],documents:[]};
  }

  async function pushLocal({showMessage=true}={}) {
    if (!syncState.connected || !syncState.masterFileId || syncState.syncing) return;
    syncState.syncing = true;
    updateUi();
    if (showMessage) setMessage('Guardando proyectos en la carpeta fija de Google Drive…');
    try {
      const local = localState();
      let remoteRaw = null, remote = null;
      try {
        const remoteRead = await readJsonFile(syncState.masterFileId);
        remoteRaw = remoteRead.raw;
        remote = remoteRead.parsed;
      } catch {}

      const localCount = stateCount(local);
      const remoteCount = stateCount(remote);
      if (localCount === 0 && remoteCount > 0) {
        setMessage('Protección activa: no se reemplazó una copia de Drive con una base local vacía.','error');
        return;
      }

      if (remoteRaw && JSON.stringify(remote) !== JSON.stringify(local)) {
        await ensureBackupFile(remoteRaw);
      }
      await writeJsonFile(syncState.masterFileId,local);
      syncState.lastSync = new Date();
      setMessage('Proyectos sincronizados automáticamente con Google Drive.','ok');
    } finally {
      syncState.syncing = false;
      updateUi();
    }
  }

  async function pullRemote({force=false,reload=true}={}) {
    if (!syncState.connected || !syncState.masterFileId || syncState.syncing) return false;
    syncState.syncing = true;
    updateUi();
    try {
      const remoteRead = await readJsonFile(syncState.masterFileId);
      const remote = remoteRead.parsed;
      const local = localState();
      const shouldPull = force || stateTime(remote) > stateTime(local) || (stateCount(local) === 0 && stateCount(remote) > 0);
      if (!shouldPull) return false;
      syncState.suppressLocalHook = true;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(remote));
      syncState.suppressLocalHook = false;
      syncState.lastSync = new Date();
      setMessage('Se cargó la copia más reciente de proyectos desde Google Drive.','ok');
      if (reload) {
        sessionStorage.setItem('thermabot.drive.last_pull',String(Date.now()));
        setTimeout(()=>location.reload(),120);
      }
      return true;
    } finally {
      syncState.syncing = false;
      updateUi();
    }
  }

  async function initialSync() {
    await ensureFiles();
    const remoteRead = await readJsonFile(syncState.masterFileId);
    const remote = remoteRead.parsed;
    const local = localState();
    const rt = stateTime(remote), lt = stateTime(local);
    const rc = stateCount(remote), lc = stateCount(local);

    if ((rt > lt && rc > 0) || (lc === 0 && rc > 0)) {
      await pullRemote({force:true,reload:true});
      return;
    }
    if (lt > rt && lc > 0) {
      await pushLocal({showMessage:false});
    }
    syncState.lastSync = new Date();
    setMessage('Google Drive conectado a la carpeta fija de Seguimiento.','ok');
    updateUi();
  }

  function schedulePush() {
    if (syncState.suppressLocalHook || !syncState.connected) return;
    clearTimeout(syncState.pushTimer);
    syncState.pushTimer = setTimeout(()=>pushLocal({showMessage:false}).catch(err=>setMessage(err.message,'error')),AUTO_PUSH_DELAY_MS);
  }

  function hookLocalStorage() {
    if (window.__THERMABOT_DRIVE_STORAGE_HOOK__) return;
    window.__THERMABOT_DRIVE_STORAGE_HOOK__ = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      const result = original.call(this,key,value);
      if (key === STORAGE_KEY) schedulePush();
      return result;
    };
  }

  function startPolling() {
    clearInterval(syncState.pollingTimer);
    syncState.pollingTimer = setInterval(async()=>{
      if (!syncState.connected || syncState.syncing || document.hidden) return;
      try {
        const remoteRead = await readJsonFile(syncState.masterFileId);
        const remote = remoteRead.parsed;
        const local = localState();
        if (stateTime(remote) > stateTime(local)) await pullRemote({force:true,reload:true});
      } catch (err) {
        if (/401|autentic/i.test(String(err?.message||''))) {
          syncState.connected = false;
          updateUi();
          setMessage('La sesión de Drive venció. THERMABOT intentará reconectar; si no puede, usá “Conectar Google Drive”.','error');
        }
      }
    },REMOTE_POLL_MS);
  }

  async function connect({interactive=false}={}) {
    if (syncState.syncing) return;
    setMessage(interactive ? 'Conectando con Google Drive…' : 'Reconectando automáticamente con Google Drive…');
    try {
      await acquireToken(interactive);
      await initialSync();
      startPolling();
    } catch (err) {
      syncState.connected = false;
      updateUi();
      if (interactive) setMessage(err.message,'error');
      else setMessage('Drive listo para reconectar. Si Google pide autorización, presioná “Conectar Google Drive” una vez.','');
    }
  }

  function overrideDriveControls() {
    const navDrive = document.querySelector('[data-view="drive"]');
    if ($('driveQuickBtn')) $('driveQuickBtn').onclick = () => {
      if (navDrive) navDrive.click();
      if (!syncState.connected) connect({interactive:true});
    };
    if ($('connectDriveBtn')) $('connectDriveBtn').onclick = () => connect({interactive:true});
    if ($('pushDriveBtn')) $('pushDriveBtn').onclick = () => pushLocal({showMessage:true}).catch(err=>setMessage(err.message,'error'));
    if ($('pullDriveBtn')) $('pullDriveBtn').onclick = () => {
      if (confirm('¿Cargar la copia maestra desde Google Drive? Se conservará una copia de seguridad en Drive antes de futuros guardados.')) {
        pullRemote({force:true,reload:true}).catch(err=>setMessage(err.message,'error'));
      }
    };
    if ($('saveDriveClientBtn')) {
      const prior = $('saveDriveClientBtn').onclick;
      $('saveDriveClientBtn').onclick = e => {
        if (typeof prior === 'function') prior.call($('saveDriveClientBtn'),e);
        setTimeout(()=>connect({interactive:true}),50);
      };
    }
  }

  async function initFixedDriveSync() {
    hookLocalStorage();
    overrideDriveControls();
    updateUi();
    setInterval(updateUi,1200);

    const clientId = getClientId();
    if (!clientId) {
      setMessage('Carpeta fija configurada. Falta guardar el Google OAuth Client ID una sola vez para activar la sincronización automática.');
      return;
    }
    await connect({interactive:false});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',()=>setTimeout(initFixedDriveSync,80));
  } else {
    setTimeout(initFixedDriveSync,80);
  }
})();
