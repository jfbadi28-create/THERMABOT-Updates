# Bitácora

## 2026-10-07 — Geometría Quadri
**Rama:** `feat/geometry-workbench-20261007`  
**Base inspeccionada:** `fc79d07e790361faca628923609dc2aa54eaf577`

1. Se inspeccionaron integración del tracker, UI Quadri, motor geométrico, tipos y pruebas.
2. Se confirmó que las ventanas se vinculan por `parentId`, heredan azimut/inclinación y se descuentan una sola vez del cerramiento.
3. Se confirmó que el azimut interviene en radiación solar: editar orientación puede cambiar carga térmica.
4. Se implementó una vista isométrica proporcional a largo/ancho/altura, con giro de cámara en pasos de 90°, zoom y restablecimiento.
5. Se separó visualmente posición del muro dentro del recinto de orientación geográfica.
6. Se agregó selección sincronizada de muros, cubierta y ventanas. Las ventanas resaltan el muro anfitrión sin inventar coordenadas sobre la cara.
7. Se mejoraron etiquetas/unidades/estado inválido de dimensiones, jerarquía del panel de propiedades, comportamiento móvil y navegación por teclado.
8. Se regeneraron los artefactos browser con Node 24.
9. Ejecución CI temporal: run 37670725537, build exitoso y 75/75 tests Quadri aprobados, 0 fallos.
10. El workflow temporal usado para generar artefactos fue retirado de la rama.

**Estado:** EN VALIDACIÓN — pruebas automatizadas aprobadas; falta revisión QA independiente de autor antes de producción.
