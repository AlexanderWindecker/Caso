# Caso · Informes QA

Aplicación local para crear informes de pruebas funcionales usando las ocho secciones del template compartido. Los documentos se descargan como Word real (.docx), con capturas embebidas.

## Ejecutar

Requiere Node.js 22 o superior. La primera vez, ejecutar dentro de esta carpeta:

```powershell
npm ci
npm run build
```

Abrir `Iniciar.cmd` o ejecutar:

```powershell
node --env-file-if-exists=.env.local scripts/serve.mjs
```

Entrar en http://localhost:4310. El archivo Iniciar.cmd inicia el servicio en segundo plano y abre el navegador. Si se ejecuta el comando manual, mantener la terminal abierta. Los navegadores que se conecten a este servicio local comparten los informes guardados en disco.

## Funciones

- Crear, editar y eliminar informes y casos; duplicar casos dentro del informe.
- Aplicación, ambiente, responsable y versión compartidos por todos los casos.
- Campos de las ocho secciones y No Aplica para automatización.
- Check Bug por caso, con título, descripción, resultado esperado, resultado obtenido, severidad y prioridad. Los pasos para reproducir se toman siempre del flujo actual del caso. Desmarcar conserva el borrador del bug.
- Word de bugs independiente: cada bug se exporta individualmente o junto con los demás del informe. Los vinculados incluyen automáticamente todas las evidencias del caso, más las capturas adicionales adjuntadas al bug. Los campos vacíos se omiten.
- Bugs independientes: desde la barra lateral se pueden crear defectos sin caso asociado, con pasos propios y evidencias por selección, arrastre o pegado. Las capturas permiten descripción, reordenamiento y eliminación. Se guardan en disco, respaldos e historial, igual que los casos.
- Capturas PNG/JPG por selección, arrastre o pegado, con descripción, orden y ampliación. Máximo 20 por caso y 10 MB por original; imágenes mayores a 2400 px se reducen para el documento.
- Guardado automático en disco en `data/`, con una caché en IndexedDB. Cada versión se conserva y puede recuperarse como copia desde Historial. Los distintos navegadores o perfiles del mismo equipo acceden a los informes del servicio local. Las evidencias se guardan una sola vez por contenido. Esperar “Guardado en disco” antes de cerrar.
- Protección contra sobrescrituras entre pestañas: se rechaza una edición basada en una versión anterior y se conserva ese borrador en Historial. Descargar respaldos JSON permite llevar una copia a otro equipo.
- Vista previa del contenido y exportación de casos seleccionados a Word, con numeración consecutiva, encabezado y pie de página.
- Ejemplo ilustrativo disponible; no se marca ejecutado ni OK automáticamente.
- Integración de análisis multimodal preparada en `/api/analyze`, con revisión y selección de campos antes de aplicar cambios. Nunca asigna OK/KO.

## Estado de IA y plantilla

La IA no está activada: todavía falta configurar una credencial real del servicio. La aplicación lo indica y permite usar todas las funciones manuales. No simula interpretar imágenes.

La configuración del servidor admite `OPENAI_API_KEY` y `OPENAI_MODEL` mediante variables de entorno o un archivo local `.env.local` excluido del control de versiones. No incluir credenciales en respaldos ni en el código.

La integración usa Responses con imágenes en base64 y `store: false`, según https://developers.openai.com/api/docs/guides/images-vision. El análisis transmite únicamente datos del informe y el caso seleccionado con sus evidencias al servicio al pulsar Generar con IA. Hay que revisar tanto las propuestas como el contenido de capturas antes de enviarlo. Modelo configurable; el valor predeterminado es gpt-6-astra.

El Word sigue la estructura textual recibida. El formato exacto del template corporativo queda pendiente del `.docx` original; esta versión no importa plantillas arbitrarias.

## Desarrollo y validación

```powershell
npm install
npm run build
npm test
node scripts/validate-artifact.mjs
npm start
```

`src/` contiene interfaz, estilos, datos, generación de Word y endpoint IA. `scripts/build.mjs` compila el cliente e incorpora sus archivos en un Worker ESM portable. `worker/index.js` y `dist/` son salidas generadas; editar `src/` y compilar. `scripts/serve.mjs` adapta el Worker a Node y escucha solo en loopback. La validación de IA usa un proveedor simulado; no acredita análisis real sin credencial.

## Almacenamiento y actualizaciones

La aplicación funciona localmente y conserva sus datos en `data/`. Esa carpeta contiene informes, versiones y evidencias: conservarla al mover o actualizar la aplicación. El servicio escucha solo en este equipo. `data/`, `recovery/`, exportaciones y credenciales quedan excluidos del repositorio.
