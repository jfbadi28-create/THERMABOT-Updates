# Informe ejecutivo Word · 0.9.0

En Proyectos, pulsar **Generar informe Word**, elegir el período y toda la cartera o un proyecto, completar destinatario y firmante, revisar datos y descargar. El documento .docx queda editable y utiliza la plantilla institucional aportada por el propietario. No requiere servicios externos para generar el archivo.

## Origen de cada sección

| Sección de la plantilla | Datos de THERMABOT |
| --- | --- |
| Resumen ejecutivo | Estado y etapa actuales; tareas/hitos pendientes con fecha vencida; fecha real de finalización |
| Decisiones / intervención | Casilla Requiere decisión, texto de decisión requerida; proyectos bloqueados o urgentes |
| Obras en ejecución | Etapa o sección explícita Obra; avance técnico ingresado; próximo hito pendiente y su fecha |
| Aprobación / cotización / contratación | Etapa; decisión requerida, espera, bloqueo o pendiente técnico; próxima acción |
| Proyectos en desarrollo | Estado de ingeniería o etapa; pendiente técnico; año objetivo o año de la fecha objetivo |
| Cambios del período | Historial de novedades y actividad fechada del proyecto; se incluyen todos los registros del período |
| Finalizados en el período | Estado Finalizado y fecha de cierre dentro del período; última novedad registrada |
| Consideraciones finales | Prioridad editable; sugerencia basada en decisiones y próximas acciones registradas |

**Editar ficha / Actualizar proyecto → Datos para el informe ejecutivo** permite registrar decisión requerida, sección, estado de ingeniería, pendiente técnico y año objetivo. El avance técnico es visible en ambos formularios. Para un próximo hito, agregar una tarea/hito dentro de Seguimiento. La fecha de cierre y la capacidad instalada continúan en Cierre y capacidad instalada.

No se inventan fechas, avances, autorizaciones ni pendientes. Vacío aparece como **Sin registrar**. Un cierre sin fecha no se atribuye a un período. Las secciones vacías muestran Sin registros. Las esperas se superponen a las fases de obra/aprobación/desarrollo; no se suman como fases independientes.

El estado y los indicadores son la fotografía actual a la fecha de emisión; los cambios y cierres se filtran por el período elegido. No se presenta el estado actual como una reconstrucción histórica del último día del período. Las fechas de actividad se interpretan en Argentina.

Destinatario y firmante se conservan en las preferencias existentes; los campos de proyecto y sus cambios usan el guardado existente. La conexión nube mantiene su confirmación real. El Word descargado no se sube automáticamente como archivo binario a Drive.

## Plantilla y validación

Se mantienen las ocho secciones, el membrete, las imágenes, las relaciones, la tipografía y los estilos de la plantilla. Se mejoran alineación de las celdas, repetición de encabezados, espaciado de firma y protección del cierre frente a saltos de página. La firma escrita es texto editable, no firma digital.

`report-core.js` reúne los datos; `report-docx.js` reemplaza campos aunque estén divididos entre fragmentos de Word y repite filas; `reports.js` proporciona revisión y descarga. JSZip se sirve desde el mismo sitio con su licencia incluida. La generación modifica sólo el XML del cuerpo, conservando las demás partes del paquete de la plantilla preparada.

Pruebas: datos faltantes, períodos y alcance, cero como avance válido, validación de campos y trazabilidad, escape XML, múltiples registros, conservación del paquete y cartera vacía. Se revisaron copias con cuatro y dieciséis proyectos en Word. Los archivos de ejemplo contienen datos ficticios y no se publican con la app.
