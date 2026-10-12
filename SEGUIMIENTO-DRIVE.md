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

## Automatizaciones 0.11

La web muestra novedades desde la última visita, inactividad por etapa, reclamos listos para copiar, listas por etapa sin duplicados y un informe de los últimos siete días (fecha argentina). No envía mensajes externos ni aprueba documentos. Las listas son guías de gestión, no certificados normativos.

### Inventario automático y verificación documental

`functions/api/drive-automation.js` recorre carpetas por lotes de 12 consultas, conserva paginación y cursor y publica sólo al completar el recorrido. Mantiene el inventario clasificado original y escribe únicamente `AUTO - INVENTARIO DRIVE`. El buscador superpone la metadata actual por ID. Archivos no localizados o carpetas inaccesibles se señalan para verificación, sin asegurar que fueron eliminados.

Configurar en Cloudflare Pages:
- Cuenta de servicio Google existente, con permiso de lectura en las carpetas y escritura en el registro y archivo de estado.
- `THERMABOT_DOCUMENT_INDEX_SHEET_ID`: planilla ya organizada.
- `THERMABOT_AUTOMATION_STATE_ID`: archivo JSON privado dedicado, inicialmente `{}`; nunca usar la base de proyectos ni su respaldo.
- `THERMABOT_INVENTORY_ROOT_ID`: opcional. Sin él se recorren las obras del control estructural; con él, el árbol de esa raíz.

La web visible consulta cada cinco minutos. Las versiones de Drive se verifican al aprobar documentos enlazados y al revisar los vinculados; cambios posteriores producen alertas. Documentos aprobados antes de disponer de una versión verificable se señalan como sin base de comparación.

### Estructuras de obras nuevas

Configurar `THERMABOT_OBRAS_ROOT_ID` y el maestro real explícito en `THERMABOT_DRIVE_MASTER_ID`. La API verifica el proyecto en el maestro y crea sólo carpeta y secciones faltantes identificadas por `appProperties`. Un proyecto que ya tiene referencia a Drive exige asociar su carpeta existente. La vinculación al proyecto usa el control habitual de revisión; si hay conflicto, muestra la carpeta creada para recuperarla.

### Ejecución con la web cerrada

El Worker privado está en `workers/automation-scheduler.js`; `workers/wrangler.toml` define un disparo cada cinco minutos. No expone acciones públicas. Debe desplegarse por separado en la misma cuenta Cloudflare y recibir la cuenta de servicio y los IDs de inventario/estado como secretos. Publicar Pages no despliega ese Worker ni activa su horario.

1. Crear y verificar un archivo de estado privado dedicado y conceder los permisos mínimos indicados.
2. Configurar Pages y comprobar Automatizaciones → Actualizar inventario, verificando el avance y la pestaña generada.
3. Desplegar el Worker con `npx wrangler deploy --config workers/wrangler.toml`; configurar sus secretos sin incluirlos en GitHub.
4. Verificar ejecuciones completas y advertencias en Cloudflare. La frecuencia es de lotes, no una promesa de actualización instantánea de todo Drive.
