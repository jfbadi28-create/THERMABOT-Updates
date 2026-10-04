# Quadri y Drive
Seguimiento y balance Quadri integrados. Se conservan entradas completas, ambientes, revisiones, resumen y version de motor; las trazas se regeneran. Los balances anteriores conservan su motor.

## Activacion pendiente
Habilitar Drive API y Sheets API en Google Cloud. Crear una cuenta de servicio y compartirle la carpeta Base de datos y balances como editor, y la planilla existente como lector. Configurar directamente en Cloudflare los secretos GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY; nunca publicar la clave en GitHub o mensajes. Volver a implementar y verificar desde dos dispositivos.

La primera carga recupera la planilla. La nueva base JSON guarda seguimiento, vinculos y calculos con copia anterior. Los conflictos conservan el borrador local. Hasta autorizar Google se indica Copia local; el respaldo en la nube no esta confirmado.
