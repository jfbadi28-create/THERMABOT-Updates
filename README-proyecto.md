# THERMABOT — proyecto de trabajo

## Alcance actual
Mejora de la sección Geometría del módulo Quadri embebido desde `tracker.html?view=calculator`, para el proyecto `drv_cemar_3p`.

## Arquitectura inspeccionada
- Shell estático principal: `tracker.html`, `tracker.js`, `tracker.css`.
- Calculador térmico embebido: `quadri/index.html`.
- Fuente UI: `quadri/src/ui/app.ts` + `quadri/src/ui/workbench.css`.
- Motor geométrico: `quadri/src/engine/geometria_edificio.ts` y `quadri/src/engine/edificio.ts`.
- Generación browser: `quadri/build.mjs` produce `quadri/index.html` y `quadri/dist-app.js`.
- Persistencia principal del cliente: estado del módulo y almacenamiento local; la integración del shell se conserva sin migraciones.
- Validación continua: `.github/workflows/validate-static.yml`.
- `water/carrier_water.py` existe, pero esta revisión no lo modifica.

## Regla de la mejora
El motor de ingeniería permanece como fuente de verdad. La vista 3D/isométrica sólo representa datos ya calculados o ingresados y su estado de cámara no modifica geometría, azimut, áreas ni resultados.
