# THERMABOT — Google Drive permanente

## Objetivo

El seguimiento de proyectos usa Google Drive como fuente maestra permanente. El navegador conserva una copia local para velocidad/offline, pero al abrir THERMABOT en Cloudflare Pages vuelve a leer siempre el archivo maestro de Drive.

Carpeta fija:

- `THERMABOT / Seguimiento`
- Folder ID: `1u6FTkPnQaVbA9f8FIACLTI0YsR6OPeaZ`

Archivos actuales usados por el backend:

- Maestro: `1BglmmoarrBiFdOPFybF0kBxg8HBsL6Oj`
- Backup previo: `1AGenMZhPPk-7iTWJ0stdcn66VWVUNgJd`

La API también protege contra el error observado de sobrescribir una cartera completa con una copia local vacía o de un solo proyecto.

## Arquitectura

```text
THERMABOT en navegador
        |
        | HTTPS /api/tracker-sync
        v
Cloudflare Pages Function
        |
        | Service Account Google
        v
Google Drive
  seguimiento-proyectos.json  <- maestro
  segundo JSON                <- backup previo
```

El usuario NO vuelve a iniciar OAuth de Google en cada PC. La credencial de Google queda únicamente del lado servidor.

## Configuración única

### 1. Crear Service Account

En Google Cloud Console:

1. Seleccionar el proyecto usado para THERMABOT.
2. Habilitar `Google Drive API`.
3. IAM & Admin -> Service Accounts -> Create service account.
4. Crear una clave JSON para esa Service Account.
5. Conservar de ese JSON solamente:
   - `client_email`
   - `private_key`

No subir el JSON ni la clave al repositorio.

### 2. Compartir Drive

Compartir la carpeta:

`https://drive.google.com/drive/folders/1u6FTkPnQaVbA9f8FIACLTI0YsR6OPeaZ`

con el `client_email` de la Service Account y permiso **Editor**.

Esto permite que la cuenta de servicio lea y actualice los dos JSON existentes sin pedir login de Google al navegador.

### 3. Crear Secrets en Cloudflare Pages

En el proyecto THERMABOT de Cloudflare Pages:

`Settings -> Variables and Secrets`

Agregar como **Secrets**:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

En `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` pegar la clave privada completa, incluido:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

No poner estos valores en GitHub.

### 4. Redeploy

Realizar un nuevo deploy de `main` en Cloudflare Pages.

## Funcionamiento

Al abrir `tracker.html` en Cloudflare:

1. THERMABOT consulta `/api/tracker-sync`.
2. El servidor se autentica contra Google Drive.
3. Se descarga siempre la cartera maestra.
4. Si la copia del navegador difiere, se reemplaza por la versión maestra y se recarga la pantalla.
5. Cada modificación de proyecto/equipo/hito/documento se guarda automáticamente en Drive.
6. Antes de modificar el maestro se copia la versión previa al archivo de backup.
7. Cada 60 segundos se comprueba si otra PC dejó una versión más nueva.

## Seguridad contra pérdida de proyectos

Sin `force=1`, el backend rechaza:

- una base vacía si Drive tiene información;
- una cartera de 0 o 1 proyecto si Drive tiene 5 o más proyectos.

Esto impide que un localStorage incompleto borre accidentalmente la cartera consolidada.

## GitHub Pages

GitHub Pages no ejecuta `/functions`, por lo que no puede ofrecer esta conexión permanente servidor-a-servidor. En GitHub Pages THERMABOT mantiene el mecanismo OAuth de navegador anterior como fallback.

Para uso normal y permanente del seguimiento, usar la URL de Cloudflare Pages.
