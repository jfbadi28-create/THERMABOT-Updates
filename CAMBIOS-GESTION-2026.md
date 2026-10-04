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
