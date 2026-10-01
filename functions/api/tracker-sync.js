// THERMABOT · Google Sheets como fuente maestra del seguimiento.
// Cloudflare Pages Function. Usa Service Account almacenada en Secrets.
// Secrets requeridos:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
//
// Compartir la planilla maestra con la Service Account como Editor.

const SPREADSHEET_ID = '1EhdGZwuo3t8k_Y32tVbYEtUTjjOBbo88eyK7OFXEXBs';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const FOLDER_ID = '1u6FTkPnQaVbA9f8FIACLTI0YsR6OPeaZ';
const LEGACY_JSON_MIRROR_ID = '1BglmmoarrBiFdOPFybF0kBxg8HBsL6Oj';
const BACKUP_JSON_ID = '1AGenMZhPPk-7iTWJ0stdcn66VWVUNgJd';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const SCHEMAS = {
  projects: {
    sheet: 'Proyectos',
    headers: ['id','establishment','name','sector','system','priority','stage','status','progress','owner','targetDate','lastMove','nextAction','blocker','specRevision','drawingRevision','supplier','expediente','notes','sourceDriveUrl','sourceBalanceId','createdAt','updatedAt'],
  },
  equipment: {
    sheet: 'Equipos',
    headers: ['id','projectId','name','model','capacity','location','status','supplier','tag','notes'],
  },
  milestones: {
    sheet: 'Hitos',
    headers: ['id','projectId','title','type','dueDate','status','owner','notes'],
  },
  documents: {
    sheet: 'Documentos',
    headers: ['id','projectId','type','title','revision','status','driveUrl','updatedAt'],
  },
};

let tokenCache = { accessToken: null, expiresAt: 0 };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function base64UrlBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlText(text) { return base64UrlBytes(new TextEncoder().encode(text)); }
function pemToArrayBuffer(pem) {
  const normalized = String(pem || '').replace(/\\n/g, '\n').trim();
  const b64 = normalized.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '');
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY vacío o inválido.');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
async function signJwt(email, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlText(JSON.stringify({ alg:'RS256', typ:'JWT' }))}.${base64UrlText(JSON.stringify({ iss:email, scope:GOOGLE_SCOPE, aud:TOKEN_ENDPOINT, iat:now, exp:now+3600 }))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(privateKeyPem), { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name:'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlBytes(new Uint8Array(sig))}`;
}
async function getAccessToken(env) {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.accessToken;
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) throw new Error('Faltan los Secrets GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');
  const assertion = await signJwt(email, privateKey);
  const response = await fetch(TOKEN_ENDPOINT, {
    method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ grant_type:'urn:ietf:params:oauth-grant-type:jwt-bearer', assertion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Google OAuth service account: ${payload.error_description || payload.error || response.status}`);
  tokenCache = { accessToken:payload.access_token, expiresAt:Date.now()+Number(payload.expires_in || 3600)*1000 };
  return tokenCache.accessToken;
}
async function googleRequest(env, url, options = {}) {
  const token = await getAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google API ${response.status}: ${detail.slice(0,500)}`);
  }
  return response;
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Formato de seguimiento inválido.');
  return {
    ...raw,
    schemaVersion: Number(raw.schemaVersion || 1),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
  };
}
function counts(state) {
  return { projects:state.projects.length, equipment:state.equipment.length, milestones:state.milestones.length, documents:state.documents.length };
}
function totalRecords(c) { return c.projects + c.equipment + c.milestones + c.documents; }
function rowsToObjects(values = []) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const headers = values[0].map(v => String(v ?? '').trim());
  return values.slice(1).filter(row => row.some(v => String(v ?? '').trim() !== '')).map(row => {
    const obj = {};
    headers.forEach((h,i) => { if (h) obj[h] = row[i] ?? ''; });
    return obj;
  });
}
function objectsToValues(headers, rows) {
  return [headers, ...rows.map(row => headers.map(h => row?.[h] ?? ''))];
}
function configMap(values = []) {
  const out = {};
  for (const row of values.slice(1)) if (row?.[0]) out[String(row[0])] = row[1] ?? '';
  return out;
}

async function getSheetValues(env, range) {
  const url = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
  const response = await googleRequest(env, url);
  return (await response.json()).values || [];
}
async function readMasterObject(env) {
  const [projectsV,equipmentV,milestonesV,documentsV,configV] = await Promise.all([
    getSheetValues(env,'Proyectos!A1:W1000'),
    getSheetValues(env,'Equipos!A1:J1000'),
    getSheetValues(env,'Hitos!A1:H1000'),
    getSheetValues(env,'Documentos!A1:H1000'),
    getSheetValues(env,'Configuracion!A1:B100'),
  ]);
  const config = configMap(configV);
  const projects = rowsToObjects(projectsV).map(p => ({ ...p, progress:Number(p.progress || 0) }));
  const state = normalizeState({
    schemaVersion:Number(config.schemaVersion || 1),
    updatedAt:String(config.updatedAt || new Date().toISOString()),
    importSource:String(config.importSource || 'Google Sheets'),
    projects,
    equipment:rowsToObjects(equipmentV),
    milestones:rowsToObjects(milestonesV),
    documents:rowsToObjects(documentsV),
    trackerMetadata:{
      generatedBy:String(config.generatedBy || 'THERMABOT project tracker'),
      statusPolicy:String(config.statusPolicy || ''),
      sourceOfTruth:'Google Sheets',
      spreadsheetId:SPREADSHEET_ID,
    },
  });
  return state;
}

async function clearManagedRanges(env) {
  const body = { ranges:['Proyectos!A1:W1000','Equipos!A1:J1000','Hitos!A1:H1000','Documentos!A1:H1000','Configuracion!A1:B100'] };
  await googleRequest(env, `${SHEETS_BASE}/${SPREADSHEET_ID}/values:batchClear`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
}
async function writeMasterSheets(env, state) {
  const c = counts(state);
  const configValues = [
    ['Clave','Valor'],
    ['schemaVersion', state.schemaVersion || 1],
    ['updatedAt', state.updatedAt],
    ['importSource', state.importSource || 'THERMABOT / Google Sheets'],
    ['sourceOfTruth','Google Sheets'],
    ['folderId',FOLDER_ID],
    ['spreadsheetId',SPREADSHEET_ID],
    ['projects',c.projects],
    ['equipment',c.equipment],
    ['milestones',c.milestones],
    ['documents',c.documents],
    ['generatedBy', state.trackerMetadata?.generatedBy || 'THERMABOT project tracker'],
    ['statusPolicy', state.trackerMetadata?.statusPolicy || ''],
  ];
  const data = [
    { range:'Proyectos!A1', majorDimension:'ROWS', values:objectsToValues(SCHEMAS.projects.headers,state.projects) },
    { range:'Equipos!A1', majorDimension:'ROWS', values:objectsToValues(SCHEMAS.equipment.headers,state.equipment) },
    { range:'Hitos!A1', majorDimension:'ROWS', values:objectsToValues(SCHEMAS.milestones.headers,state.milestones) },
    { range:'Documentos!A1', majorDimension:'ROWS', values:objectsToValues(SCHEMAS.documents.headers,state.documents) },
    { range:'Configuracion!A1', majorDimension:'ROWS', values:configValues },
  ];
  await clearManagedRanges(env);
  const response = await googleRequest(env, `${SHEETS_BASE}/${SPREADSHEET_ID}/values:batchUpdate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ valueInputOption:'RAW', includeValuesInResponse:false, data }),
  });
  return response.json();
}
async function appendHistory(env, action, detail) {
  const range = encodeURIComponent('Historial!A:D');
  await googleRequest(env, `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ values:[[new Date().toISOString(),'THERMABOT Web',action,detail]] }),
  });
}
async function writeDriveJson(env, fileId, payload) {
  const response = await googleRequest(env, `${DRIVE_UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`, {
    method:'PATCH', headers:{'Content-Type':'application/json; charset=utf-8'}, body:JSON.stringify(payload,null,2),
  });
  return response.json();
}

async function status(env) {
  const master = await readMasterObject(env);
  return json({
    ok:true,
    mode:'google-sheets-master',
    folderId:FOLDER_ID,
    spreadsheetId:SPREADSHEET_ID,
    spreadsheetUrl:SPREADSHEET_URL,
    updatedAt:master.updatedAt,
    counts:counts(master),
  });
}
async function readMaster(env) {
  const master = await readMasterObject(env);
  return json(master,200,{
    'X-THERMABOT-Mode':'google-sheets-master',
    'X-THERMABOT-Spreadsheet':SPREADSHEET_ID,
  });
}
async function saveMaster(request, env) {
  let raw;
  try { raw = await request.json(); }
  catch { return json({ok:false,error:'JSON de entrada inválido.'},400); }
  let incoming;
  try { incoming = normalizeState(raw); }
  catch (error) { return json({ok:false,error:error.message},400); }

  const current = await readMasterObject(env);
  const incomingCounts = counts(incoming);
  const remoteCounts = counts(current);
  const force = new URL(request.url).searchParams.get('force') === '1';
  if (!force) {
    if (totalRecords(incomingCounts) === 0 && totalRecords(remoteCounts) > 0) {
      return json({ok:false,error:'Protección activa: se rechazó reemplazar la planilla maestra con una base local vacía.',remoteCounts,incomingCounts},409);
    }
    if (remoteCounts.projects >= 5 && incomingCounts.projects <= 1) {
      return json({ok:false,error:'Protección activa: se rechazó una reducción accidental de la cartera a uno o cero proyectos.',remoteCounts,incomingCounts},409);
    }
  }

  await writeDriveJson(env, BACKUP_JSON_ID, { ...current, _backupAt:new Date().toISOString(), _backupSource:'Google Sheets' });

  incoming.updatedAt = new Date().toISOString();
  incoming.trackerMetadata = {
    ...(incoming.trackerMetadata || {}),
    sourceOfTruth:'Google Sheets',
    spreadsheetId:SPREADSHEET_ID,
  };
  const sheetsResult = await writeMasterSheets(env,incoming);
  await appendHistory(env,'Sincronización web',`Guardados ${incomingCounts.projects} proyectos, ${incomingCounts.equipment} equipos, ${incomingCounts.milestones} hitos y ${incomingCounts.documents} documentos.`);
  await writeDriveJson(env, LEGACY_JSON_MIRROR_ID, { ...incoming, _mirrorOfSpreadsheet:SPREADSHEET_ID });

  return json({
    ok:true,
    mode:'google-sheets-master',
    spreadsheetId:SPREADSHEET_ID,
    spreadsheetUrl:SPREADSHEET_URL,
    updatedAt:incoming.updatedAt,
    counts:incomingCounts,
    sheets:sheetsResult,
  });
}

export async function onRequest(context) {
  try {
    const method = context.request.method.toUpperCase();
    if (method === 'GET') {
      const url = new URL(context.request.url);
      return url.searchParams.get('status') === '1' ? status(context.env) : readMaster(context.env);
    }
    if (method === 'PUT' || method === 'POST') return saveMaster(context.request,context.env);
    return json({ok:false,error:'Método no permitido.'},405,{Allow:'GET, PUT, POST'});
  } catch (error) {
    return json({ok:false,error:error?.message || String(error)},500);
  }
}
