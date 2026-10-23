// THERMABOT MCP bridge: pure JSON-RPC/tool logic with no credentials or I/O.
export const MCP_VERSION = '2025-06-18';
const SOURCE_FIELDS = ['id', 'name', 'establishment', 'sector', 'system', 'priority', 'stage', 'status', 'progress', 'targetDate', 'nextDueDate', 'lastMove', 'nextAction', 'blocker', 'specRevision', 'drawingRevision', 'updatedAt', 'sourceDriveUrl'];
const DOCUMENT_FIELDS = ['id', 'projectId', 'type', 'title', 'revision', 'status', 'driveUrl', 'updatedAt'];
const pick = (x, keys) => Object.fromEntries(keys.filter(k => x?.[k] !== undefined && x?.[k] !== null).map(k => [k, x[k]]));
const idIsSafe = x => typeof x === 'string' && /^[\w-]{1,140}$/.test(x);
export function normalizeMaster(raw, masterId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('INVALID_MASTER');
  let tracker = raw, mode = 'tracker-json', revision = null;
  if (raw.format === 'thermabot-cloud-v1') {
    if (!raw.values || typeof raw.values['thermabot.tracker.v1'] !== 'string') throw Error('TRACKER_MISSING');
    tracker = JSON.parse(raw.values['thermabot.tracker.v1']);
    mode = 'thermabot-cloud-v1';
    revision = typeof raw.revision === 'string' ? raw.revision : null;
  }
  if (!tracker || !Array.isArray(tracker.projects) || !Array.isArray(tracker.documents) || !Array.isArray(tracker.milestones) || !Array.isArray(tracker.equipment)) throw Error('TRACKER_SCHEMA_INVALID');
  const projectIds = new Set();
  for (const p of tracker.projects) {
    if (!idIsSafe(p?.id) || projectIds.has(p.id)) throw Error('PROJECT_ID_INVALID');
    projectIds.add(p.id);
  }
  return {
    source: { system: 'Google Drive / THERMABOT', masterId, mode, revision, updatedAt: raw.updatedAt || tracker.updatedAt || null },
    tracker
  };
}
const tools = [
  { name: 'thermabot_status', description: 'Comprobar la fecha, el esquema y la cantidad de registros en la base de Drive realmente leída por el servidor THERMABOT.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'thermabot_list_projects', description: 'Listar proyectos registrados en THERMABOT; el filtro es opcional y los resultados conservan su ID estable.', inputSchema: { type: 'object', properties: { search: { type: 'string', maxLength: 100 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: 'thermabot_get_project', description: 'Consultar un proyecto por ID de THERMABOT junto a sus hitos y documentos registrados.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'thermabot_list_documents', description: 'Listar documentos registrados por ID de proyecto; no sustituye la comprobación en Google Drive de aprobación o revisión.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } }
];
export { tools };
function result(id, output) { return { jsonrpc: '2.0', id, result: output }; }
function failure(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function toolText(data) { return { content: [{ type: 'text', text: JSON.stringify(data) }] }; }
const messageError = message => toolText({ ok: false, error: message });
export async function processRpc(message, loadSnapshot) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return failure(message?.id, -32600, 'Invalid Request');
  const { method, id } = message;
  if (id === undefined || id === null) return null;
  if (method === 'initialize') return result(id, { protocolVersion: MCP_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'thermabot-hvac-bridge', version: '0.1.0' } });
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools });
  if (method !== 'tools/call') return failure(id, -32601, 'Method not found');
  const name = message.params?.name, args = message.params?.arguments ?? {};
  if (typeof name !== 'string' || !tools.some(t => t.name === name) || !args || Array.isArray(args) || typeof args !== 'object') return failure(id, -32602, 'Invalid params');
  if (Object.keys(args).some(k => !['search', 'limit', 'projectId'].includes(k))) return failure(id, -32602, 'Invalid params');
  if (name === 'thermabot_status' && Object.keys(args).length) return failure(id, -32602, 'Invalid params');
  if (name === 'thermabot_list_projects' && (args.search !== undefined && (typeof args.search !== 'string' || args.search.length > 100) || args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) || args.projectId !== undefined)) return failure(id, -32602, 'Invalid params');
  if (['thermabot_get_project', 'thermabot_list_documents'].includes(name) && (!idIsSafe(args.projectId) || Object.keys(args).length !== 1)) return failure(id, -32602, 'Invalid project ID');
  try {
    const { source, tracker } = await loadSnapshot();
    const projects = tracker.projects, documents = tracker.documents, milestones = tracker.milestones, equipment = tracker.equipment;
    if (name === 'thermabot_status') return result(id, toolText({ ok: true, source, counts: { projects: projects.length, documents: documents.length, milestones: milestones.length, equipment: equipment.length } }));
    if (name === 'thermabot_list_projects') {
      const q = (args.search || '').trim().toLocaleLowerCase('es');
      const candidates = projects.filter(p => !q || [p.id, p.name, p.establishment, p.sector].some(s => String(s || '').toLocaleLowerCase('es').includes(q)));
      const limit = args.limit || 40;
      return result(id, toolText({ ok: true, source, total: candidates.length, returned: Math.min(candidates.length, limit), projects: candidates.slice(0, limit).map(p => pick(p, SOURCE_FIELDS)) }));
    }
    const project = projects.find(p => p.id === args.projectId);
    if (!project) return result(id, { ...messageError('PROJECT_NOT_FOUND'), isError: true });
    if (name === 'thermabot_list_documents') return result(id, toolText({ ok: true, source, projectId: args.projectId, documents: documents.filter(d => d.projectId === args.projectId).slice(0, 200).map(d => pick(d, DOCUMENT_FIELDS)) }));
    return result(id, toolText({ ok: true, source, project: pick(project, SOURCE_FIELDS), milestones: milestones.filter(m => m.projectId === args.projectId).slice(0, 100).map(m => pick(m, ['id', 'projectId', 'title', 'type', 'dueDate', 'status'])), documents: documents.filter(d => d.projectId === args.projectId).slice(0, 100).map(d => pick(d, DOCUMENT_FIELDS)) }));
  } catch { return result(id, { ...messageError('SOURCE_UNAVAILABLE_OR_INCOMPATIBLE'), isError: true }); }
}
