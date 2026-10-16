// THERMABOT — autenticación privada para Cloudflare Pages.
// Web y API existente: HTTP Basic. ÚNICAMENTE /mcp: token Bearer independiente.
function unauthorized(message = 'Acceso restringido', mode = 'Basic') {
  return new Response(message, {
    status: 401,
    headers: {
      'WWW-Authenticate': mode === 'Bearer' ? 'Bearer realm="THERMABOT MCP"' : 'Basic realm="THERMABOT", charset="UTF-8"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
function configurationError() {
  return new Response('THERMABOT no tiene configuradas las credenciales de acceso.', {
    status: 503, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }
  });
}
function safeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}
function decodeBasic(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const raw = atob(header.slice(6).trim());
    const separator = raw.indexOf(':');
    if (separator < 0) return null;
    return { username: raw.slice(0, separator), password: raw.slice(separator + 1) };
  } catch { return null; }
}

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (path === '/mcp') {
    const secret = context.env.THERMABOT_MCP_TOKEN;
    // Fail closed if not configured to a high-entropy, independently rotated token.
    if (typeof secret !== 'string' || secret.length < 32) return configurationError();
    const header = context.request.headers.get('Authorization') || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!provided || !safeEqual(provided, secret)) return unauthorized('Token MCP inválido', 'Bearer');
  } else {
    const expectedUser = context.env.THERMABOT_USER;
    const expectedPassword = context.env.THERMABOT_PASSWORD;
    if (!expectedUser || !expectedPassword) return configurationError();
    const credentials = decodeBasic(context.request.headers.get('Authorization'));
    if (!credentials) return unauthorized();
    if (!safeEqual(credentials.username, expectedUser) || !safeEqual(credentials.password, expectedPassword)) return unauthorized('Usuario o contraseña incorrectos');
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
