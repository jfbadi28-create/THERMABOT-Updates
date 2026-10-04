# Fuentes y decisiones de la prueba Quadri 0.1

Referencia bibliografica: Nestor Quadri, Manual de Aire Acondicionado y Calefaccion, 3a edicion, 2005. Se citan paginas impresas del libro.

Las tablas se transcribieron visualmente; no se confió en el texto OCR para las columnas numéricas. Las páginas indicadas en la interfaz son las **páginas impresas del libro**. Se incluyen datos numéricos y referencias, no el PDF ni imágenes del libro.

| Datos / regla | Libro | Referencia de lectura |
|---|---|---|
| K de materiales, paredes, losas y vidrios · Cuadro 3-I | 44–45 | 23 |
| Clima Rosario, Buenos Aires, Córdoba y Santa Fe · Cuadro 1-III | 96–97 | 49 |
| Correcciones de temperatura y HR · Cuadro 2-III | 100 | 51 |
| Δt equivalente de muros y cubiertas · Cuadro 3-III | 102–103 | 52 |
| Transmisión y locales adyacentes | 104–105 | 53 |
| Radiación para 25/30/35/40° S · Cuadro 4-III | 106–107 | 54 |
| Protecciones del vidrio y personas · Cuadros 5/6-III | 108 | 55 |
| Luces y equipos; potencia eléctrica | 109–110 | 55–56 |
| Ventilación · Cuadros 8/9-III | 111–112 | 56–57 |
| Carga sensible/latente de aire nuevo y balance | 113–119 | 57–60 |
| Ejemplo independiente de verano | 116–119 | 59–60 |
| Pérdidas de invierno y piso sobre terreno | 124–125 | 63 |
| Zd, Zh, Zc y caudal de calefacción | 126–129 | 64–65 |
| Ejemplo independiente de invierno | 130–131 | 66 |
| Mezcla, FCS, PRA, PRS y condensado | 70–87 | 36–44 |

## Políticas explícitas de cálculo

- Se usa **K en kcal/(h·m²·°C)**. Se conserva la conversión práctica del manual `1 W = 0,86 kcal/h`; las cifras en kW siguen esa misma convención.
- El cálculo de verano evalúa **horas solares 06–18**, comunes a las tablas solares cargadas. No constituye un perfil nocturno ni un máximo de 24 h.
- En Cuadro 2-III se interpolan linealmente las horas intermedias. La variación diaria elegida es un dato adoptado por el usuario; 11 °C no se presenta como un registro validado de Rosario.
- Cuadro 3-III tiene base **35° S**, variación **11 °C**, y **Te15−Ti = 10 °C**. Se aplica `Δteq=Δttabla+(Te15−Ti)−10`. La fila K más próxima se registra por cerramiento; K real sigue multiplicando el área. Para otros casos puede ingresarse una diferencia equivalente manual, constante en esta prueba.
- Solar: se puede elegir una latitud tabulada o interpolar linealmente entre tablas de 25/30/35/40° S con la latitud ingresada. Esta interpolación es una política de implementación declarada, no una quinta tabla publicada. Azimutes intermedios usan la orientación cardinal/intercardinal más próxima.
- El coeficiente `c` del vidrio/protección pertenece al Cuadro 5-III. **No se multiplica también por SHGC** del motor anterior. La fracción soleada se ingresa por ventana y hora.
- Los K de losas de biblioteca cambian con el sentido del calor: verano desde arriba, invierno desde abajo. Un K manual conserva su valor en ambas estaciones.
- Invierno es estacionario. No descuenta personas, luces ni equipos y no suma humidificación. El terreno a 10 °C y K=1 son aproximaciones prácticas del manual, editables; se aplica sólo si se declara piso sobre terreno.
- Se puede redondear cada aporte a kcal/h enteras, como la planilla publicada, o conservar decimales. El ejemplo usa redondeo de planilla.
- Con caudal adoptado se deriva la temperatura efectiva de impulsión de la carga sensible. La temperatura propuesta verifica el caudal necesario; no se fuerzan simultáneamente datos incompatibles.
- La mezcla usa proporción de caudales como el procedimiento práctico del manual. Las propiedades, HR, saturación y volumen específico se obtienen mediante el auxiliar numérico preexistente de psicrometría. Se identifica por separado en las trazas; no se afirma que sus coeficientes ASHRAE sean tablas de Quadri.
- PRA es la intersección de la recta FCS con saturación; PRS es la intersección de la recta mezcla–impulsión con saturación. Se resuelven numéricamente y pueden resultar no disponibles. No se sustituyen por el punto de rocío del aire.
- La ventilación por porcentaje usa `Ca=max(porcentaje·C, mínimo·personas)`. En modo manual, los mínimos se comparan sin alterar el caudal ingresado. Infiltración es un aporte separado y debe evitarse contarla dos veces.
- Se verifica una ficha ingresada por el usuario contra **total, sensible y caudal en todas las horas evaluadas**. No se inventan modelos ni prestaciones del fabricante.

## Límites de esta entrega

Biblioteca inicial de materiales y cuatro ciudades; no se ha digitalizado todo el libro. No incluye motor de fugas de presurización, humidificador, red de conductos, meses distintos mediante simulación solar, inclinaciones arbitrarias de vidrio ni curvas de fabricantes. Las tablas históricas no se presentan como una actualización normativa. Los datos de equipos eléctricos del manual se identifican como estimaciones históricas editables.

Las entradas de otros motores conservan geometría y valores manuales, pero las decisiones de método (actividad, vidrio/protección, servicio y ventilación) deben revisarse. El estado original del motor anterior permanece en otra carpeta y otro origen local.