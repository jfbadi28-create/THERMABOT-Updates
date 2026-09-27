# THERMABOT — GitHub Pages / PWA

Esta carpeta es la versión instalable como aplicación web (PWA).

## Publicación inicial
1. Subir todos estos archivos a la raíz de `THERMABOT-Updates`.
2. En GitHub: Settings → Pages.
3. Source: Deploy from a branch.
4. Branch: `main`.
5. Folder: `/(root)`.
6. Save.

La app quedará disponible en:
https://jfbadi28-create.github.io/THERMABOT-Updates/

## Instalación en Windows
Abrir la URL en Edge o Chrome y elegir "Instalar aplicación".

## Actualizaciones
Cuando se reemplacen los archivos publicados en GitHub, la aplicación comprueba
el Service Worker y toma la versión nueva automáticamente al volver a abrirla
(o al detectar el nuevo Service Worker).

## Datos
Los proyectos se guardan localmente en el navegador mediante localStorage.
No se publican en GitHub.

## Importante
La base estable original v0.1 permanece guardada por separado.
Esta versión es una candidata v0.2 PWA.
