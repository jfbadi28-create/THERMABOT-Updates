# Conexión guiada Google — THERMABOT 0.12

## Activación inicial por el titular

1. En Google Cloud habilitar Drive API y Google Sheets API. Crear un cliente OAuth de tipo **Aplicación web** y configurar el consentimiento. Para uso privado en modo de prueba, incluir la cuenta que autorizará; comprobar en la consola las limitaciones y vigencia de ese modo antes de usarlo permanentemente.
2. Registrar exactamente el retorno de producción: `https://thermabot-updates.pages.dev/api/google-auth?action=callback`. Cada dominio de pruebas necesita su propia URL registrada; no reutilizar una URL de preview para producción.
3. En Cloudflare crear un namespace KV privado y vincularlo a Pages como `THERMABOT_GOOGLE_AUTH`. Configurar los secretos `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` y `THERMABOT_GOOGLE_TOKEN_KEY`. Esta última es una clave aleatoria de 32 bytes en Base64, generable dentro de Configuración. Conservarla: cambiarla impide leer la autorización existente. No guardar secretos en GitHub, archivos del Drive ni conversaciones.
4. Aplicar la configuración al entorno de producción y volver a desplegar Pages. Los previews deben tener almacenamiento y autorización separados para evitar que una prueba cambie producción.
5. Entrar en **Configuración → Conectar Google y elegir recursos → Conectar / renovar mi cuenta Google**. Elegir la cuenta y aceptar Drive y Sheets en la pantalla de Google.
6. Elegir recursos en Drive. Se verifica el tipo y contenido: base cloud válida, respaldo independiente, registro con pestañas compatibles y carpetas accesibles. El selector no sobrescribe la base. Al cambiar de base descarga una copia completa, pausa el guardado, limpia las colecciones locales y recarga la base elegida. No cambiar con ediciones o guardados pendientes. Comprobar la cartera y el estado de guardado antes de continuar.
7. Para el inventario elegir raíz, registro documental y estado de automatización. El selector puede crear un registro privado vacío en la carpeta elegida; reutiliza un registro identificado existente sin borrar su contenido. Luego ejecutar el recorrido desde Automatizaciones y verificar documentos concretos.

## Verificación de producción

Autorizar Google no prueba por sí solo que todos los recursos sean accesibles. Verificar la base seleccionada, abrir una carpeta y un pliego conocidos, y guardar una novedad de prueba identificada. Comprobar que aparece desde otro dispositivo antes de dar la integración por concluida. KV puede tardar en reflejar cambios entre regiones: si todavía se muestra la selección anterior, esperar y volver a comprobar, sin volver a seleccionar repetidamente.

## Almacenamiento y compatibilidad

La autorización renovable se cifra con AES-GCM antes de guardarse en KV. Los IDs elegidos se guardan aparte; no contienen credenciales. Las rutas de Google usan esa autorización en servidor y mantienen compatibilidad con la cuenta de servicio o refresh token configurados anteriormente. La autenticación privada de THERMABOT sigue protegiendo las rutas OAuth y el selector.

El Worker programador necesita el mismo binding KV, clave de cifrado y cliente Google para usar la nueva conexión. Sus triggers requieren despliegue separado de Pages; publicar esta versión no activa el cron automáticamente. No incorporar IDs ni secretos al archivo público de Wrangler.

La cuenta autoriza acceso Drive y Sheets para permitir lectura, carga de fotos, mantenimiento y guardado. THERMABOT conserva permisos de los archivos; no los hace públicos. La revocación se realiza desde la cuenta Google, y una autorización vencida requiere volver a conectar. No se implementa un chat de búsqueda de catálogos en esta entrega.
