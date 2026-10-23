import { connectionEnv } from './google-connection-store.js';
import { g, hasGoogleCredentials } from './api/tracker-sync.js';
import { normalizeMaster, processRpc } from './mcp-core.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

async function snapshot(rawEnv) {
  const env = await connectionEnv(rawEnv);
  if (!hasGoogleCredentials(env)) throw Error('DRIVE_NOT_CONFIGURED');
  const id = env.THERMABOT_DRIVE_MASTER_ID || '1BglmmoarrBiFdOPFybF0kBxg8HBsL6Oj';
  if (!/^[\w-]{1,160}$/.test(id)) throw Error('INVALID_MASTER_ID');
  const response = await g(env, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  const raw = await response.json();
  return normalizeMaster(raw, id);
}

// The global middleware authenticates only /mcp using THERMABOT_MCP_TOKEN.
// No permissive CORS, no browser cookies, no modification tools.
export async function onRequest(ctx) {
  if (ctx.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!ctx.request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Expected application/json' }, 415);
  if (Number(ctx.request.headers.get('Content-Length') || 0) > 65536) return json({ error: 'Payload too large' }, 413);
  const bytes = await ctx.request.text();
  if (new TextEncoder().encode(bytes).length > 65536) return json({ error: 'Payload too large' }, 413);
  let message;
  try { message = JSON.parse(bytes); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const output = await processRpc(message, () => snapshot(ctx.env));
  return output === null ? new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } }) : json(output);
}
