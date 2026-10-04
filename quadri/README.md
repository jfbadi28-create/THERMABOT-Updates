# THERMABOT · Quadri · Prueba 0.1

Versión de prueba del balance térmico de verano e invierno, basada en el PDF del Manual de Néstor Quadri, 3ª edición, aportado por el usuario. Se conservan menú lateral, cinco pasos, formulario central, panel derecho y microinteracciones.

## Cómo probarla

1. En esta computadora, abrir **http://127.0.0.1:8772/** mientras el servidor de esta sesión esté activo.
2. Para conservarla, descomprimir `THERMABOT-Prueba-Quadri-01.zip` y abrir `index.html` en un navegador de escritorio. La aplicación y sus dependencias están incluidas; no requiere instalar Node ni Python para abrir ese archivo.
3. En **Ubicación y clima**, elegir Rosario y verano/invierno. Revisar clima, temperatura interior y supuestos.
4. En **Envolvente**, editar muros/ventanas: elegir material, orientación y exposición; elegir protección del vidrio. Agregar ambientes y sus ventanas o vincular una pared compartida.
5. Cargar personas/actividad, iluminación, equipos y ventilación. Los ceros pendientes se avisan; no se presentan como mediciones.
6. En **Resultados**, seleccionar una hora solar, consultar fórmulas, guardar el edificio o exportar JSON/PDF.

**Cargar ejemplo del libro** crea o actualiza un proyecto separado de verificación. No reemplaza el proyecto en el que estabas trabajando.

## Comparación con el libro

| Caso | Dato publicado | Resultado de la prueba |
|---|---:|---:|
| Verano a las 15 h · QSi | 9.802 kcal/h | 9.802 kcal/h |
| Verano a las 15 h · QLi | 450 kcal/h | 450 kcal/h |
| Verano a las 15 h · QT | 14.308 kcal/h | 14.308 kcal/h |
| Invierno · Qo | 6.566 kcal/h | 6.566 kcal/h |
| Invierno · Qt | 8.208 kcal/h | 8.208 kcal/h |
| Invierno · QT | 12.696 kcal/h | 12.696 kcal/h |

El gráfico evalúa otras horas además de las 10 y 15 comparadas por el ejemplo publicado. Con sus entradas, el máximo del intervalo 06–18 ocurre a las **16 h: QT=14.413 kcal/h**. Para comparar con la planilla del libro, elegir **15:00** en el selector del gráfico. No se fuerza el máximo a coincidir con una hora elegida en el ejemplo.

## Qué está implementado

- Balance de verano y calefacción de invierno; conductos, suplementos de servicio/orientación y piso sobre terreno cuando se declaran.
- Muros, cubiertas, ventanas y ambientes múltiples; áreas netas y transferencias entre ambientes sin duplicar superficies.
- Biblioteca inicial: 27 fichas de K, cuatro ciudades, seis protecciones del vidrio, seis actividades, equipos de referencia, correcciones diarias y tablas solares de cuatro latitudes.
- FCS, C, Ca, mezcla, PRA, PRS y condensado. Impulsión efectiva coherente con el caudal adoptado.
- Verificación de ficha ingresada contra carga total, sensible y caudal. Requiere prestaciones del fabricante en condiciones reales.
- Fórmulas, variables, unidades, procedencia y página del libro; PDF por ambiente, JSON del ambiente/edificio y respaldo del espacio.

El guardado es local al navegador y origen. Esta entrega no está publicada y no guarda en Drive. La versión anterior sigue disponible en otra carpeta y en el puerto 8770. Para recuperar tus ambientes de esa versión, exportar **Respaldo JSON** allí e **Importar** en esta prueba, conservando el archivo original. Después revisar las elecciones propias de Quadri.

Los valores de ejemplo no representan un proyecto real verificado. Esta es la versión para que compares tus balances antes de reemplazar el motor publicado. Ver **FUENTES_QUADRI.md** para bases, aproximaciones y alcance.

## Archivos

- `index.html`: aplicación completa.
- `biblioteca-quadri.json`: datos numéricos y fuente del PDF.
- `ejemplo-quadri-verano.json` / `ejemplo-quadri-invierno.json`: entradas y resultados reproducibles.
- `verificacion-quadri.json`: comparación numérica.
- `src/engine/quadri.ts`: motor Quadri y sus trazas; `catalogo_quadri.ts`: tablas; `casos_quadri.ts`: ejemplo del manual.
- `tests/quadri.test.ts`: 12 pruebas del método. Las otras 44 conservan la comprobación del motor anterior y la geometría compartida.

El código RTS previo se mantiene para compatibilidad y regresiones; la interfaz de esta prueba utiliza Quadri y no exige factores CTS/RTS.

## Desarrollo

Node.js con soporte nativo de TypeScript (se utilizó v24): `node build.mjs` para reconstruir y `node --test --test-isolation=none tests/*.test.ts` para ejecutar 56 pruebas. El empaquetador elimina tipos; no es un chequeo estático completo de TypeScript. No se requieren paquetes externos para compilar el HTML.


## Prueba 0.2 · carga y revisión del edificio

- Botones Verano / Invierno en el encabezado: cambian todos los ambientes del proyecto, conservando geometría, cargas y las condiciones de ambas estaciones.
- En la misma barra de ambientes, “N bloques por revisar” abre el control de carga de todos los locales. Confirmá clima, envolvente, cargas internas y aire. Cada cambio relevante invalida únicamente su revisión. Un cero confirmado es válido; no se supone que falte ocupación o ventilación solo por estar en cero.
- Al editar un muro, cubierta o ventana, buscá materiales por nombre. La selección carga automáticamente K y muestra su procedencia de biblioteca. Se mantienen los K de verano e invierno del catálogo.
- “Archivo del proyecto” permite guardar una versión completa, descargar el proyecto JSON o recuperarlo. El archivo contiene todos los ambientes, paredes compartidas, ambas condiciones de diseño y estados de revisión; no necesita Drive. El respaldo general del pie sigue incluyendo el espacio completo.
- “Carga revisada” registra una revisión de entradas hecha por el usuario, no una certificación del cálculo. La comparación con un balance real sigue pendiente.

Comprobaciones 0.2: 61 pruebas automatizadas aprobadas. Incluyen invalidación de revisión al editar, conservación al cambiar estación, recuperación de revisión por JSON y los ejemplos publicados de verano/invierno.
