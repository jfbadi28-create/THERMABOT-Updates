# THERMABOT — acceso privado con usuario y contraseña

## Situación actual

La URL actual de GitHub Pages sigue siendo pública. GitHub Pages sirve archivos estáticos y no ofrece un control de acceso real por usuario/contraseña para este proyecto.

Agregar un formulario de login solamente en JavaScript NO sería seguridad real: cualquier persona podría descargar el HTML/JS o saltear el control desde el navegador.

Por eso THERMABOT incluye ahora un middleware de autenticación server-side para Cloudflare Pages en:

`functions/_middleware.js`

Este middleware protege todas las rutas y archivos estáticos con HTTP Basic Authentication.

Las credenciales NO se guardan en GitHub.

## Arquitectura recomendada

GitHub
  ↓
Deploy automático
  ↓
Cloudflare Pages
  ↓
Middleware de autenticación
  ↓
Usuario + contraseña
  ↓
THERMABOT

## Variables requeridas

Crear dos Secrets en Cloudflare Pages:

- `THERMABOT_USER`
- `THERMABOT_PASSWORD`

No escribir sus valores en el repositorio.

## Configuración de Cloudflare Pages

1. Crear/iniciar sesión en Cloudflare.
2. Abrir Workers & Pages.
3. Crear una aplicación Pages.
4. Importar un repositorio Git existente.
5. Conectar GitHub y seleccionar `jfbadi28-create/THERMABOT-Updates`.
6. Production branch: `main`.
7. Framework preset: None.
8. Build command: `exit 0`.
9. Build output directory: `.` (raíz del repositorio).
10. Realizar el primer deploy.

Luego:

1. Abrir el proyecto Pages.
2. Settings → Variables and Secrets.
3. Agregar `THERMABOT_USER` como Secret.
4. Agregar `THERMABOT_PASSWORD` como Secret.
5. Guardar.
6. Ejecutar un nuevo deploy.

Al abrir la URL `*.pages.dev`, el navegador solicitará usuario y contraseña antes de servir THERMABOT.

## Seguridad

- El middleware falla cerrado: si faltan las credenciales, devuelve 503 y no entrega la aplicación.
- Las respuestas autenticadas usan `Cache-Control: private, no-store`.
- No hay contraseñas ni hashes de contraseñas dentro del repositorio.
- El middleware cubre la aplicación completa, incluidos los archivos estáticos.

## Importante: GitHub Pages

Mientras `https://jfbadi28-create.github.io/THERMABOT-Updates/` siga habilitado, esa URL continuará siendo pública.

Después de verificar que la versión de Cloudflare funciona correctamente, deshabilitar GitHub Pages para que no quede una segunda URL pública sin autenticación.

Ruta en GitHub:

Settings → Pages → Build and deployment → Source → Disable GitHub Pages.

No deshabilitar GitHub Pages antes de comprobar que el nuevo acceso protegido funciona.
