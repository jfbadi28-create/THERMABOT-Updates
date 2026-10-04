# Arquitectura de la prueba Quadri

`src/ui/app.ts` mantiene el shell y el asistente de cinco pasos. Entrada de ambiente → validación geométrica → vínculos con adyacentes → despacho de `index.ts` → `quadri.ts` → resultado horario/estacionario y trazas → gráficos/guardado/PDF.

`catalogo_quadri.ts` contiene hechos numéricos transcritos del PDF. `casos_quadri.ts` define las entradas del ejemplo publicado. `psicrometria.ts` aporta propiedades numéricas auxiliares, diferenciadas del procedimiento de carga de Quadri. `geometria_edificio.ts` descuenta aberturas y hereda orientación. `particiones.ts` valida relaciones entre ambientes. `edificio.ts` agrega sólo horas simultáneas y conserva el intercambio interno firmado.

Una entrada con `quadri` usa el nuevo método. Las entradas antiguas sin ese campo permiten ejecutar el motor anterior para verificar regresiones. La interfaz convierte sus borradores/importaciones explícitamente al modo Quadri sin borrar geometría.

No se agrega backend ni servicio externo. `build.mjs` genera un HTML autónomo; las fuentes TS, estilos, bibliotecas y pruebas quedan incluidas para revisión.

`revision_carga.ts` registra firmas exactas de los bloques revisados por ambiente. La interfaz invalida la revisión al cambiar sus entradas; una estación distinta no borra los datos de la otra. Estas firmas viajan en respaldos, archivos de proyecto y versiones guardadas.
