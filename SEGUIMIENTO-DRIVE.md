# Seguimiento de proyectos y documentos de Drive

La cartera conserva el JSON maestro y el guardado existentes. No se migran bases, proyectos, cálculos ni estados automáticamente.

## Uso diario

- Proyectos muestra Hoy, Vencidas, Esta semana, Sin fecha y En espera. Las urgencias sin fecha también aparecen en Hoy.
- Una acción vacía o formada sólo por guiones no se cuenta como tarea. Aparece el proyecto que necesita definir su próximo paso.
- En un proyecto, Documentos conserva los registros manuales y añade el expediente consultado desde el inventario de Drive.
- Los vínculos automáticos requieren coincidencia de un ID de carpeta o documento. Cuando no hay coincidencia, el operador elige la obra y guarda `driveProjectCode` con historial.
- El índice se consulta en sólo lectura. No convierte revisiones en aprobadas ni copia sus documentos al JSON de seguimiento.

## Conectar el índice existente

1. En Cloudflare Pages, configurar `THERMABOT_DOCUMENT_INDEX_SHEET_ID` con el ID del registro maestro existente. No publicar los datos del registro en el repositorio.
2. Verificar que la cuenta de servicio ya configurada tenga acceso de lectura a esa planilla y que Google Sheets API esté habilitada. Si requiere una autorización nueva, debe realizarla el propietario; no cambiar permisos automáticamente.
3. Desplegar y, con la sesión privada de THERMABOT, abrir `/api/workspace-sync?status=1`. La respuesta identifica el maestro efectivo, su formato, revisión y conteos. No usar la fecha de un archivo candidato como prueba de configuración desplegada.
4. Verificar que `/api/document-index` devuelve el inventario esperado, luego abrir TMO y Documentos. Buscar un archivo y confirmar que el enlace abre el original correcto.
5. Registrar una novedad y comprobar la confirmación de Drive y la revisión de la base. Realizar este paso sólo con una novedad real o un proyecto de prueba autorizado.

La ruta privada usa el middleware de autenticación existente. No incluye credenciales ni admite cambios en documentos. Una falta de acceso o configuración se muestra como error, sin presentar datos de otra fuente como actuales.

## Comprobaciones

`node --test tests/daily-work.cjs tests/document-index.cjs tests/document-index.test.mjs tests/workspace-sync.test.mjs`

La verificación local no acredita un despliegue conectado. La prueba final necesita una sesión autenticada y la configuración de producción.

## Operación diaria y captura móvil

- `Ctrl + K`: registros locales, documentos del índice conectado y acciones. `Alt + Shift + R`: registrar. `Alt + Shift + H`: Mi día.
- Chat: `/tarea texto`, `/novedad texto`, `/doc búsqueda`, `/hoy`, `/ayuda`. Los comandos abren formularios; no guardan silenciosamente.
- La vinculación desde el índice registra un borrador; la vigencia exige aprobación explícita.
- Capturas móviles: configurar `THERMABOT_CAPTURE_FOLDER_ID` con una carpeta privada y conceder acceso de escritura a la cuenta de servicio existente. Se admiten JPEG, PNG y WebP hasta 8 MB. La API mantiene autenticación Basic y comprobación de origen. Sin configuración, el formulario informa el problema y conserva el texto. La foto se sube antes de vincularla; si cambia el proyecto, se muestra el enlace del archivo ya subido para recuperarlo.
- La consulta del inventario sigue siendo de sólo lectura y no vuelve a recorrer Drive. Actualizar archivos del inventario requiere actualizar la planilla fuente.
