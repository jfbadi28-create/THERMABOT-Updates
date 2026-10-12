# THERMABOT AI V3.2 — Activación de escritura (bloqueada por defecto)

## Alcance
La API `/api/ai-project-edit` no acepta escrituras si faltan identidad Cloudflare Access verificada o IDs explícitos del maestro y respaldo. La UI requiere vista previa y confirmación. Ninguna escritura debe probarse con proyectos reales hasta completar estos puntos.

## Preparación de Cloudflare
1. Crear política Cloudflare Zero Trust Access para el endpoint `/api/ai-project-edit*`, restringida a identidades autorizadas. Confirmar que el navegador envía `Cf-Access-Jwt-Assertion` al backend y que Access no es opcional.
2. Configurar en Cloudflare Pages, como variables seguras: `THERMABOT_ACCESS_TEAM_DOMAIN` (por ejemplo `mi-equipo.cloudflareaccess.com`), `THERMABOT_ACCESS_AUD` (AUD exacto de la aplicación Access), `THERMABOT_DRIVE_MASTER_ID`, `THERMABOT_DRIVE_BACKUP_ID`. No subir secretos ni JWT a GitHub.
3. Comprobar que el ID maestro apunta a un JSON `thermabot-cloud-v1` con `thermabot.tracker.v1`, que el respaldo es otro archivo y que la cuenta de servicio tiene los permisos requeridos. Verificar en particular que los IDs del entorno de producción coinciden con los de la web.
4. Revisar por separado la seguridad de `/api/workspace-sync` (el PUT anterior solo valida Origin/header y debe endurecerse antes de declarar segura la edición general de la base).

## Pruebas mínimas antes de liberar
- Sin Access: GET y POST rechazan la operación (401), sin escrituras.
- Variables Access o IDs ausentes: rechazo, sin escrituras.
- Cuenta autorizada: GET devuelve proyecto, revisión y campos.
- Cambiar un campo permitido y confirmar en entorno de prueba: escritura, historial, nueva revisión y readback correctos.
- Repetir con revisión vieja: 409 y sin sobrescritura.
- Probar valores inválidos/campos críticos: 400 sin escrituras.
- Probar rechazo Google/respaldos fallidos: error visible y ningún éxito falso.
- Verificar que los demás proyectos, equipos, hitos, documentos y campos críticos se conservan.
- Abrir el frontend en navegador sobre despliegue de prueba, sin operar proyectos reales.

## Criterio de puesta en producción
No liberar si falta una prueba autenticada de guardado + relectura sobre una base aislada. No afirmar que V3.2 está funcional en producción únicamente porque pase CI de GitHub. Mantener el PR como borrador hasta aprobar revisión de seguridad y pruebas completas.
