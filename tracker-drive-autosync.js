(() => {
  'use strict';

  // THERMABOT · sincronización permanente del seguimiento.
  // Drive es la fuente maestra cuando el backend Cloudflare está disponible.
  // Si el backend todavía no fue configurado, tracker.js conserva el OAuth
  // de navegador anterior como fallback, para no cortar el trabajo actual.
  const STORAGE_KEY = 'thermabot.tracker.v1';
  const API_URL = './api/tracker-sync';
  const FIXED_FOLDER_ID = '1u6FTkPnQaVbA9f8FIACLTI0YsR6OPeaZ';
  const FIXED_FOLDER_URL = `https://drive.google.com/drive/folders/${FIXED_FOLDER_ID}`;
  const MASTER_FILE_NAME = 'seguimiento-proyectos.json';
  const POLL_MS = 60000;
  const PUSH_DELAY_MS = 1200;

  const state = {
    permanentMode: false,
    connected: false,
    syncing: false,
    suppressHook: false,
    pushTimer: null,
    pollTimer: null,
    uiTimer: null,
    lastSync: null,
    lastRemoteUpdatedAt: null,
    backendError: null,
  };

  const $ = id => document.getElementById(id);

  function safeParse(text) {
    try {
      const value = JSON.parse(text || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function blankState() {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), projects: [], equipment: [], milestones: [], documents: [] };
  }

  function normalize(raw) {
    const value = raw && typeof raw === 'object' ? raw : blankState();
    return {
      ...value,
      schemaVersion: Number(value.schemaVersion || 1),
      updatedAt: value.updatedAt || new Date().toISOString(),
      projects: Array.isArray(value.projects) ? value.projects : [],
      equipment: Array.isArray(value.equipment) ? value.equipment : [],
      milestones: Array.isArray(value.milestones) ? value.milestones : [],
      documents: Array.isArray(value.documents) ? value.documents : [],
    };
  }

  function localState() {
    return normalize(safeParse(localStorage.getItem(STORAGE_KEY)));
  }

  function stateCounts(value) {
    const v = normalize(value);
    return {
      projects: v.projects.length,
      equipment: v.equipment.length,
      milestones: v.milestones.length,
      documents: v.documents.length,
    };
  }

  function sameState(a, b) {
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  }

  function setMessage(message, type = '') {
    const el = $('driveMessage');
    if (!el) return;
    el.textContent = message;
    el.className = `drive-message ${type}`.trim();
  }

  function setLocal(remote) {
    state.suppressHook = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(remote)));
    } finally {
      state.suppressHook = false;
    }
  }

  function updateUi() {
    if (!state.permanentMode) return;
    const quick = $('driveQuickBtn');
    if (quick) {
      quick.textContent = state.connected ? 'Drive permanente ✓' : 'Drive permanente';
      quick.classList.toggle('dark', state.connected);
    }
    if ($('driveStateTitle')) $('driveStateTitle').textContent = state.connected ? 'Google Drive · conexión permanente' : 'Drive permanente sin conexión';
    if ($('driveFolderState')) $('driveFolderState').textContent = 'THERMABOT / Seguimiento · fija';
    if ($('driveFileState')) $('driveFileState').textContent = MASTER_FILE_NAME;
    if ($('driveSyncState')) $('driveSyncState').textContent = state.lastSync ? state.lastSync.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
    if ($('driveModeState')) $('driveModeState').textContent = state.connected ? 'Drive maestro + copia local' : 'Solo copia local';
    if ($('pushDriveBtn')) $('pushDriveBtn').disabled = !state.connected || state.syncing;
    if ($('pullDriveBtn')) $('pullDriveBtn').disabled = !state.connected || state.syncing;
    if ($('connectDriveBtn')) {
      $('connectDriveBtn').disabled = state.syncing;
      $('connectDriveBtn').textContent = state.connected ? 'Verificar conexión' : 'Conectar servidor Drive';
    }
    const link = $('openDriveFolder');
    if (link) {
      link.href = FIXED_FOLDER_URL;
      link.classList.remove('disabled');
    }

    // El OAuth del navegador deja de ser necesario sólo cuando el backend
    // permanente realmente está operativo.
    const clientInput = $('driveClientId');
    if (clientInput?.closest('label')) clientInput.closest('label').style.display = 'none';
    if ($('saveDriveClientBtn')) $('saveDriveClientBtn').style.display = 'none';
  }

  async function apiFetch(url = API_URL, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.headers || {}),
        'Accept': 'application/json',
      },
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload?.error || `Servidor de sincronización: HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function probe() {
    const info = await apiFetch(`${API_URL}?status=1`);
    if (info?.ok !== true || info?.mode !== 'permanent-server-side') {
      throw new Error('El backend respondió, pero no está en modo permanente.');
    }
    state.permanentMode = true;
    state.connected = true;
    state.backendError = null;
    state.lastRemoteUpdatedAt = info?.updatedAt || null;
    return info;
  }

  async function readRemote() {
    return normalize(await apiFetch(API_URL));
  }

  async function writeRemote(local, { force = false } = {}) {
    const url = force ? `${API_URL}?force=1` : API_URL;
    return apiFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(normalize(local)),
    });
  }

  async function pull({ reload = true, announce = true } = {}) {
    if (!state.permanentMode || !state.connected || state.syncing) return false;
    state.syncing = true;
    updateUi();
    try {
      if (announce) setMessage('Leyendo la cartera maestra desde Google Drive…');
      const remote = await readRemote();
      const local = localState();
      state.lastRemoteUpdatedAt = remote.updatedAt;
      state.lastSync = new Date();

      if (!sameState(remote, local)) {
        setLocal(remote);
        setMessage(`Drive cargado: ${stateCounts(remote).projects} proyectos en la cartera maestra.`, 'ok');
        if (reload) setTimeout(() => location.reload(), 100);
        return true;
      }
      setMessage(`Drive sincronizado: ${stateCounts(remote).projects} proyectos.`, 'ok');
      return false;
    } finally {
      state.syncing = false;
      updateUi();
    }
  }

  async function push({ announce = false } = {}) {
    if (!state.permanentMode || !state.connected || state.syncing || state.suppressHook) return false;
    state.syncing = true;
    updateUi();
    try {
      const local = localState();
      if (announce) setMessage('Guardando cambios en el archivo maestro de Google Drive…');
      const result = await writeRemote(local);
      state.lastSync = new Date();
      state.lastRemoteUpdatedAt = result?.updatedAt || local.updatedAt;
      setMessage(`Guardado permanente: ${result?.counts?.projects ?? local.projects.length} proyectos.`, 'ok');
      return true;
    } catch (error) {
      // Protección explícita contra el problema observado: una copia local
      // vacía o de un solo proyecto no puede borrar la cartera consolidada.
      if (error.status === 409) {
        setMessage(`${error.message} Se restaurará la cartera maestra de Drive.`, 'error');
        setTimeout(() => pull({ reload: true, announce: false }).catch(() => {}), 400);
        return false;
      }
      throw error;
    } finally {
      state.syncing = false;
      updateUi();
    }
  }

  function schedulePush() {
    if (!state.permanentMode || !state.connected || state.syncing || state.suppressHook) return;
    clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(() => {
      push({ announce: false }).catch(error => {
        state.backendError = error;
        setMessage(`No se pudo guardar en Drive: ${error.message}`, 'error');
      });
    }, PUSH_DELAY_MS);
  }

  function hookLocalStorage() {
    if (window.__THERMABOT_PERMANENT_DRIVE_HOOK__) return;
    window.__THERMABOT_PERMANENT_DRIVE_HOOK__ = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      const result = originalSetItem.call(this, key, value);
      if (this === localStorage && key === STORAGE_KEY && !state.suppressHook) schedulePush();
      return result;
    };
  }

  async function poll() {
    if (!state.permanentMode || !state.connected || state.syncing || document.hidden) return;
    try {
      const info = await apiFetch(`${API_URL}?status=1`);
      const remoteTime = info?.updatedAt ? new Date(info.updatedAt).getTime() : 0;
      const local = localState();
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      if (remoteTime > localTime) await pull({ reload: true, announce: false });
      state.lastSync = new Date();
      updateUi();
    } catch (error) {
      state.connected = false;
      state.backendError = error;
      updateUi();
      setMessage(`Conexión permanente interrumpida: ${error.message}`, 'error');
    }
  }

  function startPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(poll, POLL_MS);
  }

  function overrideControls() {
    const driveNav = document.querySelector('[data-view="drive"]');
    if ($('driveQuickBtn')) $('driveQuickBtn').onclick = () => {
      if (driveNav) driveNav.click();
      setTimeout(updateUi, 20);
    };
    if ($('connectDriveBtn')) $('connectDriveBtn').onclick = () => initialize({ manual: true });
    if ($('pushDriveBtn')) $('pushDriveBtn').onclick = () => push({ announce: true }).catch(error => setMessage(error.message,'error'));
    if ($('pullDriveBtn')) $('pullDriveBtn').onclick = () => pull({ reload: true, announce: true }).catch(error => setMessage(error.message,'error'));
    if (driveNav) driveNav.addEventListener('click', () => setTimeout(updateUi, 30));
  }

  async function initialize({ manual = false } = {}) {
    if (state.syncing) return;
    state.syncing = true;
    try {
      await probe();
      state.syncing = false;
      overrideControls();
      updateUi();
      if (!state.uiTimer) state.uiTimer = setInterval(updateUi, 1500);

      // Drive manda al abrir. Evita que localStorage de otra PC o una sesión
      // incompleta se convierta accidentalmente en la fuente maestra.
      await pull({ reload: true, announce: false });
      state.connected = true;
      state.lastSync = new Date();
      startPolling();
      updateUi();
    } catch (error) {
      state.syncing = false;
      state.permanentMode = false;
      state.connected = false;
      state.backendError = error;
      // No tocamos los controles: queda funcionando el OAuth de navegador
      // original de tracker.js hasta que Cloudflare quede configurado.
      console.warn('THERMABOT permanent Drive backend unavailable:', error.message);
      if (manual) setMessage(`Modo permanente todavía no disponible: ${error.message}`, 'error');
    }
  }

  async function init() {
    hookLocalStorage();
    await initialize({ manual: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
  else setTimeout(init, 100);
})();
