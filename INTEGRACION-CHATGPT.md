# THERMABOT AI — activar ChatGPT en la web

El frontend en `thermabot-ai.js` usa `/api/ai-chat` en Cloudflare Pages. Esta API se implementa en `functions/api/ai-chat.js` y llama a OpenAI desde el servidor; nunca desde el navegador.

## Pasos para el titular de la cuenta

1. Crear una clave API en https://platform.openai.com/api-keys y habilitar facturación/crédito para uso de API. **ChatGPT Plus no incluye automáticamente uso de API.**
2. Entrar a Cloudflare → **Workers & Pages** → proyecto `thermabot-updates` → **Settings → Variables and Secrets**.
3. En el ambiente **Production** crear `OPENAI_API_KEY` como **Secret / Encrypt** con esa clave. Nunca subirla a GitHub ni pegarla en la web.
4. Opcional: configurar `OPENAI_MODEL` con el nombre de un modelo habilitado en la cuenta. El valor predeterminado es `gpt-5-mini`.
5. Guardar el Secret y generar un nuevo despliegue de Cloudflare Pages.
6. Abrir https://thermabot-updates.pages.dev/tracker.html, ingresar con el acceso privado de THERMABOT, abrir el chat **AI** y presionar **Comprobar conexión**.
7. Si indica que el secreto está configurado, enviar una pregunta. El chequeo solo confirma que la clave existe; la primera respuesta confirma el circuito completo.

## Errores habituales

- `MISSING_API_KEY`: falta la clave en el ambiente de Cloudflare del despliegue.
- `OPENAI_AUTH`: clave rechazada o sin permisos.
- `OPENAI_QUOTA`: facturación, cuota o límites de consumo de OpenAI.
- `OPENAI_MODEL`: modelo no disponible o mal escrito en `OPENAI_MODEL`.
- `EMPTY_RESPONSE`: no llegó texto; probar otro modelo o una consulta más simple.
- Error HTTP 401/503 antes de recibir JSON: revisar autenticación y configuración de THERMABOT en Cloudflare.

## Seguridad y alcance

La clave vive en `ctx.env.OPENAI_API_KEY`, dentro de Cloudflare Pages Functions. La comprobación GET no llama a OpenAI, no consume tokens y **no muestra** el valor de la clave.

La protección HTTP Basic en `functions/_middleware.js` cubre la web y sus funciones. No eliminarla. Los datos de proyecto/cartera preparados por el frontend se envían a OpenAI; revisá su sensibilidad y tus controles de acceso. La IA es de **solo lectura** y no puede modificar proyectos.

El alojamiento antiguo de GitHub Pages sigue usando el endpoint Vercel que ya estaba programado; se configura por separado. Para la web Cloudflare actual no hace falta Vercel como intermediario.