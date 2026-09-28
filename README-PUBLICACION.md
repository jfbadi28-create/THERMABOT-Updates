# THERMABOT — Publicación web personal

THERMABOT ya está estructurada como una aplicación web estática/PWA basada en HTML, CSS y JavaScript puro.
No requiere backend, npm ni proceso de build para funcionar en esta etapa.

## Arquitectura actual

- Frontend: HTML + CSS + JavaScript.
- Backend: no existe en esta versión.
- Motor HVAC: JavaScript local en el navegador.
- Persistencia de proyectos: `localStorage` del navegador (`thermabot.proyectos.v1`).
- PWA: `manifest.webmanifest` + `sw.js`.
- Hosting recomendado actual: GitHub Pages.

## Importante sobre los proyectos

Publicar THERMABOT en Internet NO sincroniza automáticamente los proyectos entre computadoras.
Los proyectos actuales quedan guardados en el navegador de cada PC mediante `localStorage`.

Ejemplo:

- PC Casa: proyectos guardados en ese navegador.
- PC Trabajo: almacenamiento independiente.

La sincronización mediante Google Drive / JSON será una etapa posterior.

## Hosting elegido: GitHub Pages

Para la arquitectura actual es la opción de menor impacto:

- costo $0;
- HTTPS incluido;
- publicación directa desde GitHub;
- no requiere servidor propio;
- cada cambio en `main` puede publicarse automáticamente;
- mantiene la app independiente de la PC personal.

URL objetivo:

https://jfbadi28-create.github.io/THERMABOT-Updates/

Módulo multizona:

https://jfbadi28-create.github.io/THERMABOT-Updates/pressure.html

## Activación inicial de GitHub Pages

Este paso se realiza una sola vez si Pages todavía no está habilitado:

1. Abrir el repositorio `THERMABOT-Updates` en GitHub.
2. Ir a **Settings**.
3. Entrar a **Pages**.
4. En **Build and deployment**, seleccionar **Deploy from a branch**.
5. Branch: **main**.
6. Folder: **/(root)**.
7. Presionar **Save**.
8. Esperar el primer despliegue y abrir la URL mostrada por GitHub.

Después de esto, cada actualización de `main` se vuelve a publicar automáticamente.

## Validación automática

El repositorio incluye `.github/workflows/validate-static.yml`.
En cada Pull Request y cada push a `main` verifica:

- existencia de los archivos esenciales;
- sintaxis JavaScript;
- validez del manifest y `version.json`;
- referencias entre HTML, CSS y JavaScript.

No modifica cálculos ni fórmulas HVAC.

## PWA / uso desde Windows

Abrir la URL con Chrome o Edge.
El navegador puede ofrecer **Instalar aplicación** para abrir THERMABOT como una app independiente, aunque sigue siendo la misma aplicación web.

El Service Worker utiliza estrategia network-first y mantiene una copia local de los archivos principales para tolerar cortes temporales de conexión.

## Seguridad

No guardar en GitHub:

- contraseñas;
- tokens;
- secretos OAuth;
- API keys;
- archivos `.env` con credenciales.

El `.gitignore` ya excluye estos archivos para futuras integraciones.

La URL de GitHub Pages es pública. En esta etapa no existe autenticación personal; no guardar información sensible dentro de la aplicación.

## Etapas futuras previstas

1. Informe PDF profesional.
2. Descarga local del informe.
3. Exportación/importación JSON del proyecto.
4. Google Drive para PDF + JSON + revisiones.
5. Autenticación personal.
6. Sincronización de proyectos entre computadoras.

Estas funciones no forman parte de esta etapa de publicación web.
