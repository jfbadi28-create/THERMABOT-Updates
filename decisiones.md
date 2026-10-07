# Decisiones

## D-001 — Mantener el motor sin cambios
No se modifican fórmulas, áreas, radiación, criterios Quadri ni reglas de rectangularización. La UI sigue llamando al motor existente para validar y recalcular.

## D-002 — SVG isométrico proporcional
Se mantiene SVG en lugar de incorporar WebGL/Three.js. Para una habitación rectangular, SVG ofrece proporción geométrica, interacción, accesibilidad y menor superficie de regresión.

## D-003 — Cámara separada de orientación
Girar/zoom/restablecer la vista es estado efímero de UI. No escribe azimut ni geometría. La orientación geográfica continúa editándose mediante el flujo existente de `rectangularizeRoom`.

## D-004 — No inventar posición de ventanas
El modelo conserva área y `parentId`, pero no coordenadas 2D/3D dentro del muro. Por eso la vista muestra cantidad/área y resalta el muro anfitrión, sin dibujar aberturas en posiciones arbitrarias.

## D-005 — Modo irregular sin reconstrucción 3D
En modo manual/irregular no se infiere topología. Se prioriza la lista editable de superficies para evitar una representación espacial falsa.

## D-006 — Implicación térmica de la orientación
Loads: el azimut alimenta radiación solar. La UI lo explica explícitamente y la regresión obligatoria incluye los tests “orientación cambia radiación” y “reorienta muros existentes sin perder ventanas”.
