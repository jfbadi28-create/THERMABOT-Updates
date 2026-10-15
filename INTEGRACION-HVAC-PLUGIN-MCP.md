# Puente MCP privado THERMABOT ↔ HVAC Hospitalario – Bioingeniería

Se propone un endpoint MCP de solo lectura en Cloudflare Pages: `POST /mcp`.

## Alcance

Las cuatro operaciones son `thermabot_status`, `thermabot_list_projects`, `thermabot_get_project` y `thermabot_list_documents`. El servidor lee el JSON maestro de Google Drive configurado como `THERMABOT_DRIVE_MASTER_ID`, valida su esquema y devuelve su fecha y origen. Soporta el registro simple y el envoltorio `thermabot-cloud-v1`.

No permite actualizaciones de proyectos, aprobación de documentos, ni cambios en permisos. Los archivos técnicos originales deben consultarse mediante el conector Google Drive ya autorizado en ChatGPT.

## Seguridad y despliegue

El middleware mantiene la autenticación HTTP Basic para la web y todas las rutas existentes. La nueva ruta `/mcp` utiliza una credencial Bearer independiente almacenada en Cloudflare como Secret `THERMABOT_MCP_TOKEN`, de al menos 32 caracteres aleatorios. No incluir ninguna credencial en GitHub, en documentos o en el plugin.

1. Revisar y aprobar la PR. La rama no modifica producción hasta su fusión/despliegue.
2. Configurar el Secret en producción de Cloudflare Pages y uno diferente para preview.
3. Publicar en Pages. Comprobar autenticación y funcionamiento de la web existente.
4. Validar MCP con cliente autorizado, sin credencial y con credencial incorrecta.
5. Configurar el mismo complemento privado con un `mcp.json` que apunte a `https://thermabot-updates.pages.dev/mcp`, transport `streamable-http` y autenticación `api_key` esquema `bearer`; suministrar la clave mediante la conexión segura de ChatGPT, nunca en ZIP.
6. Verificar TMO y CEMAR cruzando el ID del proyecto, estado, fecha de la base y la documentación original de Drive.

Pruebas unitarias: `node --experimental-default-type=module --test tests/mcp-bridge.test.mjs`.

Las pruebas locales no acreditan despliegue ni configuración real. Las escrituras permanecen deshabilitadas hasta que se diseñe un mecanismo independiente de aprobación y control de concurrencia.
