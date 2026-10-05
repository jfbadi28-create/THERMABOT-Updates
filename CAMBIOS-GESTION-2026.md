## 0.9.2 · Estado real de guardado en Drive

- Google Drive muestra la conexión privada existente y la base JSON; se elimina el formulario antiguo de OAuth y la referencia al guardado en la planilla.
- Barra superior, menú, configuración y pantalla Drive comparten el mismo estado: pendiente, guardando, confirmado, conflicto o error. La fecha corresponde a la última escritura informada por Drive.
- Comprobar conexión funciona también sin cambios pendientes. No reemplaza los datos del navegador ni borra borradores.
- El estado vuelve a confirmarse al recuperar la conexión; una edición durante el guardado sigue pendiente. La prueba local permanece aislada de Drive.
- Descargar copia de recuperación usa la copia completa existente, con proyectos, historial y cálculos.

## 0.9.1 · Acceso directo a editar proyectos

- Botón Editar visible en cada fila; el nombre abre la ficha completa. El resto de la fila conserva la vista rápida.
- Editar ficha disponible también en la vista rápida del proyecto.
- Formulario con etapa, próxima acción, fecha de seguimiento y motivos de espera o bloqueo. Los campos necesarios se muestran según el estado.
- Conserva fechas de seguimiento heredadas y el inicio de las esperas; registra las modificaciones en el historial existente.
- Los proyectos nuevos conservan la etapa, próxima acción y fecha ingresadas.

## 0.9.0 · Informes ejecutivos en Word

- Generar informe Word desde Proyectos, con período, alcance, destinatario y firmante recordados.
- Las ocho secciones de la plantilla institucional se completan desde los registros, con tablas ampliables y todas las novedades del período.
- Se agregan avance técnico, sección del informe, decisión requerida, estado de ingeniería, pendiente técnico y año objetivo. Cambios trazados en el historial.
- Vista previa de indicadores y datos faltantes, con acceso a Completar ficha. No se inventan valores; los cierres sin fecha no se atribuyen al período.
- Estado actual a la fecha de emisión; novedades y cierres filtrados por período.
- Se conserva el membrete y se mejoran celdas, encabezados repetidos y paginación del cierre.
- Descarga editable en formato .docx, generada en el navegador con biblioteca local. No se sube automáticamente el archivo Word a Drive.
- Validación de la descarga, corrección de faltantes y conservación del paquete Word; informes corto y largo revisados.

## 0.8.0 · Capacidad instalada y productividad

- Cartera con seis indicadores compactos y gráfico de cuatro semanas, adaptable a móvil y ambos temas.
- Terminados filtra los proyectos Finalizados. TR instaladas abre el desglose por proyecto.
- Carga de estado, fecha real de finalización, TR realmente instaladas y fecha de instalación en Actualizar proyecto y Editar ficha. Los cambios quedan en el historial.
- Título Proyectos y subtítulo Gestión de informes editables con clic o Enter. Enter guarda, Escape cancela; al salir del campo se guarda. Preferencias incluidas en el respaldo existente.
- Gráfico con fechas objetivo y cierres reales. Las semanas abren el detalle; incluye hitos de proyectos finalizados y excluye cierres sin fecha. Objetivos actuales, sin línea base histórica ni horas trabajadas; no es PPC.
- Sin datos de capacidad se muestra un guion; el valor cero explícito se conserva. No se calcula la instalación a partir del balance térmico.
- Conserva la conexión privada y el motor térmico. Validado en prueba local; el guardado en Drive se confirma únicamente por su estado verificado.

# THERMABOT · Proyectos unificados · 0.7.0

Inicio y Proyectos se fusionan en Proyectos, nueva pantalla principal. El menú queda en Proyectos, Tareas, Cálculos y Configuración.

- Indicadores de proyectos activos, pendientes, vencidos y esperando respuesta, con acciones al pulsarlos.
- Cartera con buscador, filtros y última novedad.
- Selección de fila abre un panel lateral con Resumen, Historial y Documentos, sin abandonar la lista.
- Registro de avances y acceso al espacio completo del proyecto mediante los formularios y guardado existentes.
- Cola de pendientes prioritarios debajo de la cartera. El contador Pendientes abre Tareas filtradas sin cumplidas.
- Panel cerrable para ampliar la tabla; distribución adaptable a móvil.
- Se corrige el espacio superior vacío heredado de la pantalla anterior.
- Los enlaces antiguos de Inicio siguen funcionando y llevan a Proyectos.

Los datos existentes, el historial, la conexión privada y los motores de cálculo se conservan. El borrador separado mantiene datos ficticios. La prueba con demo=1 no guarda en Drive.

# THERMABOT · Gestión simplificada · 0.6.0

## Cambios aplicados

- Menú: Inicio, Proyectos, Tareas, Cálculos. Configuración al pie y menú colapsable.
- Marketing y Presurización retirados de la navegación; la dirección antigua de Presurización vuelve a Inicio.
- Proyectos: Resumen, Seguimiento y Documentos. Cálculos y Equipos retirados de las pestañas del proyecto.
- Resumen práctico: próximo paso, seguimiento, espera o bloqueo, alcance y último movimiento.
- Actualización rápida: novedad, estado, etapa, próxima acción y fecha. Campos de espera y bloqueo sólo cuando corresponden. Documento relacionado opcional.
- Historial con fecha, operador configurado y valores antes/después. Una actualización conserva el historial anterior y evita sobrescribir una edición posterior.
- Tareas: lista y tablero, filtros por proyecto y estado, cumplimiento directo y acceso a la actualización desde Inicio.
- Documentos: revisión y estado técnico, con los enlaces y el visor existentes.
- Cálculos: entrada independiente al balance térmico Quadri y cálculos guardados; preparada para futuras herramientas.
- Configuración: operador, tema claro/oscuro/dispositivo, copias completas y estado real de Drive.
- Diseño consistente: tablas compactas, estados discretos, foco de teclado, microinteracciones y vista móvil.

## Cómo probar

Abrir http://127.0.0.1:8776/tracker.html?demo=1 con el servidor local activo. Los ejemplos son sintéticos. La prueba está aislada de Drive y conserva los cambios únicamente en el navegador. Si ya hay registros locales, no se reemplazan por ejemplos.

1. En Inicio o Proyectos, pulsar Actualizar.
2. Escribir una novedad, elegir estado y próximo paso. En espera, identificar quién debe responder.
3. Guardar y abrir Seguimiento para consultar fecha, operador y antes/después.
4. Recargar para comprobar que la actualización permanece.
5. Abrir Cálculos para revisar el balance térmico dentro de la misma aplicación.

## Validación y conservación

Las pruebas de gestión verifican preservación de datos, espera, validación de estados y fechas, documentos del mismo proyecto, protección contra edición obsoleta e historial. Los motores matemáticos no se modifican. Los registros de equipos, finanzas y campos anteriores se conservan aunque se retiren sus accesos.

El nombre del operador identifica la preferencia configurada y no equivale a una firma autenticada. La prueba local no acredita un guardado en Drive. La web publicada conserva su conexión privada y muestra sólo confirmaciones recibidas del servicio.
