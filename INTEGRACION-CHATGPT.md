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

## Retiro del puente legado de Vercel (seguridad)

El endpoint `https://thermabot-ai-backend.vercel.app/api/ai-chat` fue retirado del código: `api/ai-chat.js` responde **HTTP 410 / LEGACY_AI_DISABLED** para cualquier método y nunca llama a OpenAI. La antigua API carecía de autenticación propia; comprobar el encabezado Origin o aplicar CORS no autentica al solicitante.

`thermabot-ai.js` ya no envía consultas desde GitHub Pages a Vercel. Las consultas abiertas de IA funcionan únicamente en la aplicación privada de Cloudflare, donde `functions/_middleware.js` protege `/api/ai-chat`. Las funciones locales del asistente que no consumen OpenAI continúan disponibles.

**Para finalizar el cierre:** desplegar esta revisión en producción, verificar que POST y GET de Vercel devuelven 410 sin consumo de OpenAI y, como defensa adicional, retirar `OPENAI_API_KEY` del entorno de Vercel si ese proyecto ya no lo necesita. Los despliegues antiguos pueden seguir disponibles bajo URLs de preview: evitar depender de su protección y revocar la antigua clave si hay dudas sobre exposición. GitHub Pages sigue siendo un alojamiento público de archivos estáticos hasta que se deshabilite por separado.

La aplicación privada de Cloudflare conserva su API de IA y su secreto de producción.