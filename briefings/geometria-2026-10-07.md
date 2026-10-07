# Briefing persistido — Mejora de Geometría

**Proyecto:** THERMABOT / `drv_cemar_3p`  
**Rama:** `feat/geometry-workbench-20261007`  
**Estado:** EN VALIDACIÓN

## KLIMA Manager
Alcance limitado a UX/UI y representación geométrica. No tocar fórmulas ni criterios HVAC. Entrega por rama y PR, sin merge a producción.

## KLIMA Design
Prioridad: claridad y velocidad. Etiquetas explícitas, unidades junto a campos, panel con jerarquía “posición / orientación / medidas / propiedades / edición”, foco visible y adaptación móvil.

## KLIMA Viz
Vista SVG proporcional. Cámara independiente del modelo. No dibujar ventanas con coordenadas inexistentes. En geometría irregular, no inferir topología.

## KLIMA Web
Implementación en la arquitectura real existente (`quadri/src/ui/app.ts` + CSS), no migración a React. Mantener el motor como fuente de verdad y regenerar artefactos mediante `build.mjs`.

## KLIMA Loads
Implicación confirmada: el azimut participa en radiación y puede modificar carga. Mantener convención existente Sur 0°, Oeste +90°, Norte ±180°, Este −90° y exigir regresión de orientación.

## KLIMA QA
Criterios: build, regresión completa, ventanas/áreas/orientaciones, teclado, responsive, no mutación por cámara, coherencia de resultados y ausencia de posiciones ficticias. La aprobación debe corresponder a la revisión final y enumerar archivos revisados.

## Limitación de coordinación
Las Skills KLIMA están disponibles como procedimientos, pero este chat no expone un ejecutor de subagentes autónomos separados. Se aplicaron los briefings por especialidad y CI ejecutó build/tests en un runner independiente; eso no se presenta como aprobación QA independiente.
