# THERMABOT 0.5 — trabajo por proyecto

El inicio reúne los pendientes, las próximas acciones y los proyectos. Las tarjetas se mueven arrastrando o con el selector de estado. Un proyecto abre un único espacio con Resumen, Cálculos, Equipos, Documentos, Hitos, Finanzas y Actividad.

Ctrl/Cmd K abre la búsqueda de proyectos, equipos, documentos, hitos y cálculos. El menú se puede contraer y el tema claro/oscuro queda guardado en el navegador.

## Datos existentes

Se mantienen las claves de seguimiento, cálculos, vínculos y conexión con Drive. No se cambia el formato de la planilla ni el backend. Los datos adicionales de finanzas, contactos e historial están en `thermabot.suite.v1`; no se envían a la planilla. Los enlaces antiguos a pendientes van al inicio; documentos/hitos abren esas secciones del proyecto.

Los balances y las redes comparten los proyectos guardados. Guardar un cálculo desde un proyecto lo vincula automáticamente. El motor térmico conserva sus ecuaciones. Se corrige el nombre de la respuesta local (`result`/`resultado`) para actualizar resultados después de editar. Cada guardado térmico conserva las redes de presión y otros proyectos de la última copia; guardar una red actualiza solo esa red.

## Equipos, tareas y finanzas

Asignar un equipo crea un hito y una partida de costo pendiente de precio. Registrar el costo completa esa partida y puede actualizar la fecha del hito. No se infieren importes, fechas ni resultados comerciales. Un precio desconocido mantiene el resultado financiero como parcial. Cada proyecto utiliza una sola moneda; marketing evita sumar distintas monedas.

La conversión usa únicamente cotizaciones con resultado Ganada/Perdida registrado; las pendientes quedan fuera del denominador. Los ingresos representan cobros ingresados manualmente y la rentabilidad usa ingresos menos costos registrados.

## Guardado y compartir

El guardado continúa siendo local con la integración de Drive existente. IndexedDB conserva hasta 30 copias automáticas completas dentro del mismo navegador. Configuración permite descargarlas, exportar todo o restaurar una copia. La restauración pide confirmación y descarga el estado anterior. Una copia interna no equivale a un respaldo fuera del equipo.

La ficha del cliente omite costos, bloqueos, notas internas y enlaces documentales. Los reportes y los casos de éxito usan el diálogo de impresión del navegador: elegir Guardar como PDF. Los casos incluyen problema, resultado escrito por el operador y hasta cuatro fotos seleccionadas con autorización. Las fotos se incorporan al informe, no se cargan a la nube automáticamente.

Drive permite vista previa incrustada cuando los permisos y el formato lo permiten. DWG necesita una vista compatible de Drive o una copia PDF. No se promete un visor CAD nativo.

Según la indicación de mantener todo en la web existente, no se añade un servidor ni Supabase. No hay portal privado, enlaces de clientes en vivo, identificación verificada de usuarios ni sincronización en nube de finanzas/historial. El historial empieza con las modificaciones observadas por esta versión y usa el nombre de operador configurado.

## Verificación

Las pruebas cubren la sincronización existente, la auditoría, recuperación, búsqueda, estados de tareas, fechas, conversión, finanzas, privacidad de la ficha, URLs de vista previa, guardados simultáneos entre herramientas y equivalencia de los motores usados en comparación. La vista local se revisó creando un proyecto de prueba, vinculando balances, registrando finanzas, asignando equipos/hitos, completando tareas y consultando copias automáticas.
