# THERMABOT · Agua de dos caños · versión de integración 1.1

Motor Python 3.10+ y CLI, sin paquetes externos. Consume **resultados** del balance térmico existente. No vuelve a calcular cerramientos, ocupación, psicrometría ni radiación.

## Archivos y arquitectura

```text
water/
├── carrier_water.py       Motor, contrato JSON, diagnóstico y consola ANSI
├── ejemplo_entrada.json   Cargas + configuración; ejemplo sintético ejecutable
├── README.md              Integración y criterios
└── test_suite.py          Pruebas con unittest (stdlib)

Balance Quadri existente
    ↓ resultados de verano/invierno, perfiles, unidades y trazas
quadri/src/engine/integracion_agua.ts   Adaptador de salida; no cambia el motor
    ↓ thermabot.water-loads.v1
carrier_water.py + configuración hidráulica documentada
    ↓ thermabot.carrier-water.v1
Importar resultado en el proyecto de THERMABOT
```

En **Cálculos**, **Agua · dos caños** es una herramienta independiente de Balance térmico. Se elige una versión completa guardada del balance; el motor Quadri existente resuelve ambas estaciones desde esas entradas, y el adaptador transfiere sus resultados con trazas. El motor de agua no repite ecuaciones térmicas.

La carga se organiza en Cargas, Diseño, Fan-coils, Red, Tanque y Resultados. Se editan unidades métricas; las conversiones al contrato Carrier se realizan una sola vez. Las nueve etapas están visibles con sus fórmulas, estados y datos pendientes. No se incluyen catálogos comerciales inventados, longitudes supuestas, pérdidas ficticias ni propiedades de fluido genéricas.

Guardar versión conserva el balance de origen, las cargas transferidas, configuración, resultado y fecha dentro de `waterCalculations` en la colección sincronizada existente `thermabot-building-v21-trial`. Los borradores se conservan por proyecto en `waterDrafts`; guardar un balance térmico preserva estas colecciones. La conexión Drive y su estado de verificación pertenecen al sincronizador existente: guardar localmente no confirma una copia remota. Las versiones preliminares se identifican como pendientes.

Para reconstruir la herramienta web: `node water/build.mjs` desde la raíz. Para las pruebas web: `node --test --test-isolation=none water/tests/web.test.ts`. Con `WATER_PYTHON` apuntando al ejecutable Python, las pruebas contrastan además seis escenarios contra la CLI. La versión standalone del balance conserva la importación/exportación JSON para revisar resultados de la CLI.

**Ejecución:** el motor Python se ejecuta en la computadora o en un servidor que admita Python. Cloudflare Pages no ejecuta este archivo Python. La herramienta integrada en Cálculos ejecuta `motor_web.ts` en el navegador, con los nueve pasos contrastados contra esta CLI. La CLI y su contrato permanecen disponibles para uso externo. No hay dependencias de terceros ni un servicio de pago para ejecutar el cálculo. En la web, las cargas y caudales se muestran aunque falten datos del catálogo o trazado; esos pasos pendientes bloquean sus resultados dependientes.

## Probar el módulo

Desde esta carpeta, con Python 3.10 o superior:

```powershell
python carrier_water.py --input ejemplo_entrada.json --json-output resultado.json
python carrier_water.py --demo --color
python -m unittest test_suite -v
```

Desde la raíz del repositorio:

```powershell
python water/carrier_water.py --input water/ejemplo_entrada.json --json-output resultado.json --no-color
python -m unittest discover -s water -p test_suite.py -v
```

`--color` fuerza ANSI; sin terminal, `--no-color` o `NO_COLOR`, se desactiva el color. La salida conserva tablas Unicode y nueve secciones. Códigos: `0` pipeline completo, `1` contrato/archivo/opciones inválidas, `2` cálculo con errores o dependencias bloqueadas. Los resultados JSON son objetos numéricos, nunca representaciones de dataclasses como texto.

## Integración con un balance real

1. Abrí el proyecto en el balance y completá ambas estaciones. **Agua · dos caños** muestra una tabla de cargas por ambiente.
2. Elegí la base: **local**, si el aire exterior se trata por separado en una central, o **equipo**, si corresponde al terminal. La base local exige dimensionar la central aparte; el motor no agrega esa carga implícitamente.
3. Exportá las cargas. El archivo `thermabot.water-loads.v1` incluye ID del proyecto, ID de cada ambiente, verano, invierno, perfiles horarios, unidades, trazas y firma de las entradas. Un balance sin revisión se identifica como preliminar. Cargas negativas/incoherentes impiden la transferencia; no se reemplazan silenciosamente por cero.
4. Tomá `configuracion_agua` del contrato de ejemplo como estructura. Reemplazá los **datos sintéticos** con condiciones, catálogo, trazado, circuitos y tanque documentados de tu obra. Asociá `espacios_servidos` y `espacio_id` a los IDs reales de la exportación. La configuración no contiene cargas térmicas duplicadas.
5. Guardá ese objeto como `configuracion_agua.json`, y ejecutá:

```powershell
python carrier_water.py --balance-input THERMABOT-cargas-agua.json --config-agua configuracion_agua.json --json-output resultado_agua.json
```

6. Importá `resultado_agua.json` en el mismo proyecto, o usá **Pegar resultado JSON**. La aplicación rechaza otro proyecto y un pipeline incompleto o contradictorio. Si cambian las entradas térmicas o se elige otra base, indica que hay que volver a calcular. **Guardar edificio** incluye el resultado en la versión guardada.

También acepta un único contrato con `schema: thermabot.carrier-water.v1`, `balance_termico` y `configuracion_agua`, o el contrato nativo legado con `espacios` en BTU/h. La API del balance no cambia.

```python
from carrier_water import cargar_json, ejecutar_pipeline, resultado_a_dict, guardar_json

sistema = cargar_json("ejemplo_entrada.json")
salida = ejecutar_pipeline(sistema)
guardar_json("resultado_agua.json", resultado_a_dict(salida))
assert len(salida["pasos"]) == 9
if not salida["apto"]:
    print(salida["diagnostico"].errores)
```

## Contrato y unidades

Las entradas del balance admiten `W`, `kW`, `kcal/h` y `BTU/h`, con unidad explícita. Se convierten a BTU/h una vez. La salida del motor usa **US gpm**, °F, ft, fps, psi y US gal. La interfaz convierte únicamente la presentación a m³/h, m/s, m.c.a. y litros.

Cada ambiente requiere ID, nombre, total y sensible de verano, total de invierno y procedencia (`motor`, `trace_ids`). El sensible máximo se dimensiona separadamente del total máximo. Si hay perfiles, sus máximos deben corresponder a esas cargas y todos los ambientes deben cubrir las mismas horas. Se conserva el perfil suministrado, sin completar horas inexistentes.

La firma contiene las entradas completas y las paredes compartidas, con la estación normalizada. Sirve para detectar resultados desactualizados; **no es una firma criptográfica ni certifica autenticidad**.

`apto` significa que el pipeline numérico terminó sin errores. **No significa aprobación técnica, selección comercial definitiva ni certificación Carrier.** `validacion_documental` declara que las transcripciones suministradas siguen pendientes de contraste independiente.

## Nueve pasos y decisiones

| Paso | Comportamiento |
|---|---|
| 1 · Cargas | Pico conjunto sumando la misma hora; si no hay perfiles, suma conservadora de máximos con aviso. Planta = 1,05 × bloque, una sola vez [P12-pág.6]. |
| 2 · Caudales | GPM = Q / (500 × ΔT) [P12-pág.5]. ΔT frío y caliente independientes; no se suman estaciones. |
| 3 · FCU | Verifica total, sensible, calefacción, caudal nominal, circuitos y mínimo turbulento. Exige fuente y condiciones verificadas del catálogo. Usa caudal nominal de la ficha en los pasos posteriores; no supone prestaciones a otro caudal. |
| 4 · Diversidad | `sin_diversidad` usa caudales completos. `chart6` usa la transcripción suministrada y orden explícito; última exposición sin reducción [P3-pág.27/30]. `coincidente` requiere perfiles y FCU verificable a caudal térmico; no supone una curva parcial de terminal. |
| 5 · Tuberías | Gobierna el mayor caudal frío/caliente. Selecciona ID por velocidad/erosión y pérdida unitaria real. Leq por fittings documentados [P3-pág.19/23]. No reduce la acometida de un terminal individual. |
| 6 · Bomba | Máximo circuito completo de ida y retorno, incluyendo FCU y pérdidas documentadas de equipos/válvulas. No suma ramales paralelos, altura estática de circuito cerrado ni factor de seguridad [P3-pág.33]. Informa puntos frío/calor; elegir fabricante exige su curva. |
| 7 · Tanque | Vt = E × Vs / (Pa − Pf) con volumen real, expansión neta y coeficientes documentados [P3-pág.34, pendiente confirmar definiciones]. No inventa volumen de equipos, no toma valor absoluto de resultados negativos. |
| 8 · Soportes | Separación por diámetro; ceil(longitud/separación) + 1, contando extremos [P3-pág.8]. Encuentros compartidos/anclajes requieren revisión del trazado. |
| 9 · Validaciones | Estado de cada paso, notas y errores. Un error bloquea las dependencias, pero los nueve pasos siempre se informan. |

La diversidad por exposición conserva el algoritmo del código proporcionado. El trazado se declara con circuitos terminales: `direct_return`/`reverse_return` identifican el layout; no generan una red geométrica automáticamente. Cada tramo declara `direccion: ida` o `direccion: retorno`. Cada circuito debe incluir ambas direcciones, todos los tramos deben quedar cubiertos por circuitos y cada terminal debe tener su recorrido.

La fricción real admite dos alternativas: un valor documentado **para ese NPS y caudal exactos**, por estación, o Darcy–Weisbach con rugosidad y viscosidades **ingresadas con fuente**. El criterio de diseño de ft/100 ft es un límite; nunca se usa como pérdida real fija. El cálculo auxiliar usa 64/Re en régimen laminar y Swamee–Jain en turbulento; el régimen transitorio exige un dato verificado. Referencia del auxiliar: [EPA, EPANET 2.2, pérdidas por fricción](https://www.epa.gov/system/files/documents/2021-07/epanet_users_manual_2.2.0-1.pdf).

## Datos que necesitan verificación documental

- **Tanque:** la fórmula volumétrica requiere un denominador adimensional. El código recibido utilizaba presiones físicas, con denominador negativo y `abs()`. Eso no era dimensionalmente válido. Esta versión solo acepta `0 ≤ Pf < Pa ≤ 1`, coeficientes declarados con fuente, y `0 < E < 1`. Necesitamos confirmar **la definición de E, Pa y Pf de la página 34**, o usar la definición documentada del fabricante. No se inventa una conversión desde psi. La página suministrada no está disponible en este encargo; los valores de ejemplo son ilustrativos.
- **Cobre:** la tabla recibida rotulada por OD contiene IDs mayores que ese OD, y falta la tabla de soportes de cobre. No se usa como catálogo de dimensionamiento. Se acepta un catálogo `tuberias` verificado, por diámetro: `id_in`, `od_in`, `wt_agua_lb_ft`, `spacing_ft`, `fuente`. Si hay accesorios, se requiere `leq_fittings_ft`, un objeto con longitud equivalente documentada para cada tipo. Las tablas de acero no se atribuyen automáticamente al cobre.
- **Chart 6 y tablas:** se conservan los valores suministrados, sin reextracción ni corrección inventada. No se extrapola fuera de su dominio. El gráfico transcripto incluye una pequeña caída entre 0,40 y 0,43; verificarla antes de adoptar reducción de caudal en obra.
- **FCU:** no se incluye una base de modelos comerciales ficticios. El catálogo de ejemplo es sintético y está identificado como tal. La verificación a condiciones de diseño la declara quien proporciona la ficha; no se generan curvas de fabricante ni correcciones psicrométricas no suministradas.
- **Fluido:** factor 500 restringido a agua. Glicol exige otro modelo y no se admite silenciosamente. Volumen de equipos debe incluir accesorios y baterías. La tabla de expansión original se conserva como referencia; no se usa para inferir expansión neta sin temperatura/base documental.

Estas limitaciones aparecen en los diagnósticos o en la guía. El software puede probarse y recibir datos reales; **todavía no hay evidencia para afirmar que reproduce los ejemplos completos del manual**. Las pruebas son de contrato, ecuaciones explícitas, unidades, invariantes del pipeline y errores.

## Integridad y cambios respecto del código recibido

Se corrigen claves incompatibles entre pasos, caudales de exposición asociados a IDs equivocados, reducción duplicada, entradas mutadas entre ejecuciones, cálculo de bomba sobre todos los ramales, tanque con presión fija y denominador negativo, y JSON serializado con `default=str`. Se rechazan unidades desconocidas, NaN/Infinity, signos inválidos, claves JSON duplicadas, IDs repetidos, perfiles incompatibles, catálogo sin prestaciones, fittings inexistentes y archivos de más de 20 MB.

Las salidas se escriben de forma atómica. La CLI no permite sobrescribir una entrada con el resultado. No hay llamadas de red, secretos, bibliotecas externas ni ejecución de contenido importado.
