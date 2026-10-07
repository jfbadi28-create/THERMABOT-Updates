# THERMABOT · Fase 1 de auditabilidad del cálculo Quadri

## Alcance aprobado

Esta fase implementa únicamente la Prioridad 1 validada contra el Manual de Aire Acondicionado y Calefacción de Néstor Quadri y el motor actual:

1. Diagrama psicrométrico interactivo con Exterior, Retorno, Mezcla, Impulsión, PRA y PRS.
2. Perfil horario apilado 06–18 h de demanda del equipo.
3. Panel “¿Por qué da esta carga?” basado en las trazas del motor.

Decisión de desglose aprobada: **1A**. Infiltración, conductos/suplementos, particiones interiores y piso se muestran como categorías separadas; no se agrupan en “Otros”.

No se implementan todavía comparador, umbral de “aire exterior dominante”, semáforo de calidad ni aptitud para informe. Esas decisiones pertenecen a fases posteriores.

## Regla de integración

- El gráfico no recalcula cargas: consume `HourResult.components`.
- El motor conserva precisión interna; el formato/redondeo es sólo visual.
- La suma de los componentes horarios debe cerrar con `systemTotal`.
- PRA y PRS usan las temperaturas calculadas por `quadriPsych()`; su ordenada para representación se obtiene con la función psicrométrica compartida `humidityRatio(T, 1, P)`.
- La trazabilidad reutiliza `Trace`; no existen fórmulas alternativas en la UI.
- Los resultados exportados conservan entradas, resultado y trazas reproducibles.

## Matriz de trazabilidad de Fase 1

| Resultado visual | Fuente en el motor | Fórmula / tabla | Referencia Quadri |
|---|---|---|---|
| Muros | `components.muros` + trazas de superficies | q = K·A·Δteq | Cuadro 3-III, pp. 102–105 |
| Techo | `components.techo` + trazas de cubierta | q = K·A·Δteq | Cuadro 3-III, pp. 102–105 |
| Vidrios | `components.ventanas` | q = K·A·ΔT | p. 104 |
| Solar | `components.solar-vidrios` | q = A·I·c | Cuadros 4/5-III, pp. 106–108 |
| Personas | `components.personas` | sensible + latente | Cuadro 6-III, p. 108 |
| Iluminación | `components.iluminacion` | potencia × factores | p. 109 |
| Equipos | `components.equipos` | potencia × factores | pp. 109–110 |
| Infiltración | `components.infiltracion` | sensible + latente | pp. 113–114 |
| Aire exterior | `components.aire-exterior` | Qse + Qle | pp. 113–119 |
| Conductos / suplementos | `components.conductos` | según estación | p. 108 / pp. 126–131 |
| Particiones | `components.particiones` | U·A·ΔT | pp. 104/124 |
| Piso | `components.piso` | K·A·ΔT | p. 125 |
| PRA | `QuadriHour.PRA` | intersección FCS–saturación | pp. 74–79 |
| PRS | `QuadriHour.PRS` | prolongación proceso M→I hasta saturación | pp. 82–87 |
| Condensado | `QuadriHour.condensate` | balance de humedad | pp. 83–87 |

## Casos de regresión

El ejemplo resuelto de verano debe conservar, a las 15 h:

- QSi = 9802 kcal/h
- QLi = 450 kcal/h
- QTi = 10252 kcal/h
- Qse = 2040 kcal/h
- Qle = 2016 kcal/h
- QTe = 4056 kcal/h
- QT = 14308 kcal/h
- QST = 11842 kcal/h
- C = 60 m³/min
- Ca = 12 m³/min

Tolerancia: exactitud del ejemplo con el redondeo de planilla ya implementado.

Psicrometría de referencia:
- PRA ≈ 11,5 °C, tolerancia ±0,5 °C.
- PRS ≈ 11 °C, tolerancia ±0,7 °C.

Nuevo invariante de Fase 1:
- Para cada hora, Σ(componentes sensible + latente) = `systemTotal`, tolerancia numérica < 1e-9 W.

## Riesgos y límites

- El perfil Quadri de verano sigue limitado a 06–18 h solares; no se presenta como simulación de 24 h.
- Los créditos negativos se conservan y se dibujan bajo cero.
- El gráfico psicrométrico es una representación de los estados calculados; no sustituye ni modifica el motor.
- Si PRA/PRS no son físicamente resolubles, no se inventan puntos.
- El modo de humedad manual “ábaco” conserva su comportamiento actual; su revisión metodológica queda fuera de esta fase.
