// THERMABOT · sincronización permanente del seguimiento con Google Drive.
// Cloudflare Pages Function. Google no se autentica en el navegador:
// la Function usa una Service Account guardada exclusivamente en Secrets.
//
// Secrets requeridos en Cloudflare Pages:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
//
// Compartir con esa Service Account (Editor) la carpeta de Seguimiento o,
// como mínimo, los dos JSON indicados abajo.

const FOLDER_ID = '1u6FTkPnQaVbA9f8FIACLTI0YsR6OPeaZ';
const MASTER_FILE_ID = '1BglmmoarrBiFdOPFybF0kBxg8HBsL6Oj';
const BACKUP_FILE_ID = '1AGenMZhPPk-7iTWJ0stdcn66VWVUNgJd';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

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

function base64UrlText(text) {
  return base64UrlBytes(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem || '').replace(/\\n/g, '\n').trim();
  const b64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY vacío o inválido.');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(email, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlText(JSON.stringify(header))}.${base64UrlText(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
}

async function getAccessToken(env) {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) {
    throw new Error('Faltan los Secrets GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');
  }
  const assertion = await signJwt(email, privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth service account: ${data.error_description || data.error || response.status}`);
  }
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return tokenCache.accessToken;
}

async function driveRequest(env, url, options = {}) {
  const token = await getAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google Drive ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response;
}

async function readDriveJson(env, fileId) {
  const response = await driveRequest(env, `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`);
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`El archivo ${fileId} no contiene JSON válido.`); }
  return { text, parsed };
}

async function writeDriveJson(env, fileId, payload) {
  const response = await driveRequest(
    env,
    `${DRIVE_UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload, null, 2),
    },
  );
  return response.json();
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
  return {
    projects: state.projects.length,
    equipment: state.equipment.length,
    milestones: state.milestones.length,
    documents: state.documents.length,
  };
}

function totalRecords(c) {
  return c.projects + c.equipment + c.milestones + c.documents;
}

async function status(env) {
  const master = normalizeState((await readDriveJson(env, MASTER_FILE_ID)).parsed);
  return json({
    ok: true,
    mode: 'permanent-server-side',
    folderId: FOLDER_ID,
    masterFileId: MASTER_FILE_ID,
    backupFileId: BACKUP_FILE_ID,
    updatedAt: master.updatedAt,
    counts: counts(master),
  });
}

async function readMaster(env) {
  const master = normalizeState((await readDriveJson(env, MASTER_FILE_ID)).parsed);
  return json(master, 200, {
    'X-THERMABOT-Drive-Mode': 'permanent',
    'X-THERMABOT-Master-File': MASTER_FILE_ID,
  });
}

async function saveMaster(request, env) {
  let incomingRaw;
  try { incomingRaw = await request.json(); }
  catch { return json({ ok: false, error: 'JSON de entrada inválido.' }, 400); }

  let incoming;
  try { incoming = normalizeState(incomingRaw); }
  catch (error) { return json({ ok: false, error: error.message }, 400); }

  const currentRead = await readDriveJson(env, MASTER_FILE_ID);
  const current = normalizeState(currentRead.parsed);
  const inCounts = counts(incoming);
  const remoteCounts = counts(current);
  const force = new URL(request.url).searchParams.get('force') === '1';

  // Protección anticorrupción: una base vacía o de 1 proyecto no puede pisar
  // accidentalmente una base consolidada de varios proyectos.
  if (!force) {
    if (totalRecords(inCounts) === 0 && totalRecords(remoteCounts) > 0) {
      return json({
        ok: false,
        error: 'Protección activa: se rechazó reemplazar una base de Drive con datos por una base local vacía.',
        remoteCounts,
        incomingCounts: inCounts,
      }, 409);
    }
    if (remoteCounts.projects >= 5 && inCounts.projects <= 1) {
      return json({
        ok: false,
        error: 'Protección activa: se rechazó una reducción accidental de la cartera a uno o cero proyectos.',
        remoteCounts,
        incomingCounts: inCounts,
      }, 409);
    }
  }

  // Primero preserva la versión anterior completa en el segundo JSON de Drive.
  const backupPayload = {
    ...current,
    _backupAt: new Date().toISOString(),
    _backupSourceFileId: MASTER_FILE_ID,
  };
  await writeDriveJson(env, BACKUP_FILE_ID, backupPayload);

  incoming.updatedAt = incoming.updatedAt || new Date().toISOString();
  const saved = await writeDriveJson(env, MASTER_FILE_ID, incoming);
  return json({
    ok: true,
    mode: 'permanent-server-side',
    updatedAt: incoming.updatedAt,
    counts: inCounts,
    drive: saved,
  });
}

export async function onRequest(context) {
  try {
    const method = context.request.method.toUpperCase();
    if (method === 'GET') {
      const url = new URL(context.request.url);
      return url.searchParams.get('status') === '1'
        ? status(context.env)
        : readMaster(context.env);
    }
    if (method === 'PUT' || method === 'POST') return saveMaster(context.request, context.env);
    return json({ ok: false, error: 'Método no permitido.' }, 405, { Allow: 'GET, PUT, POST' });
  } catch (error) {
    return json({ ok: false, error: error?.message || String(error) }, 500);
  }
}
