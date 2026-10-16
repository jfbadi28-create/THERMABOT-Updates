/**
 * Endpoint legado de Vercel: retirado por seguridad.
 *
 * No se acepta ninguna solicitud de IA en este alojamiento, independientemente
 * del método, el Origin o de si existe OPENAI_API_KEY en su entorno.
 * La IA privada funciona en Cloudflare Pages mediante /api/ai-chat,
 * protegido por functions/_middleware.js.
 */
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(410).json({
    ok: false,
    code: 'LEGACY_AI_DISABLED',
    error: 'La API antigua de Vercel fue desactivada. Abrí THERMABOT privado en https://thermabot-updates.pages.dev/tracker.html.'
  });
}
