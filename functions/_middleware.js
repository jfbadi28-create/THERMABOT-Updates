// THERMABOT — autenticación HTTP Basic para Cloudflare Pages.
// Las credenciales NO se guardan en GitHub.
// Configurar THERMABOT_USER y THERMABOT_PASSWORD como Secrets en Cloudflare.

function unauthorized(message = "Acceso restringido") {
  return new Response(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="THERMABOT", charset="UTF-8"',
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function configurationError() {
  return new Response("THERMABOT no tiene configuradas las credenciales de acceso.", {
    status: 503,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function safeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

function decodeBasic(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const raw = atob(header.slice(6).trim());
    const separator = raw.indexOf(":");
    if (separator < 0) return null;
    return {
      username: raw.slice(0, separator),
      password: raw.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const expectedUser = context.env.THERMABOT_USER;
  const expectedPassword = context.env.THERMABOT_PASSWORD;

  // Fail closed: nunca servir la aplicación sin credenciales configuradas.
  if (!expectedUser || !expectedPassword) return configurationError();

  const credentials = decodeBasic(context.request.headers.get("Authorization"));
  if (!credentials) return unauthorized();

  const userOk = safeEqual(credentials.username, expectedUser);
  const passwordOk = safeEqual(credentials.password, expectedPassword);
  if (!userOk || !passwordOk) return unauthorized("Usuario o contraseña incorrectos");

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
