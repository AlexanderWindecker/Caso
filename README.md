# Caso · Informes QA

Aplicación local para documentar casos de prueba, adjuntar evidencias y generar informes Word. Incluye bugs vinculados a casos o independientes, favoritos y recuperación de versiones.

## Editar plantillas

En **Plantilla del informe** podés editar las plantillas de casos y de bugs. Agregá campos de texto corto o largo, desplegables, checkbox y fechas; cambiá sus nombres, opciones o si son obligatorios. Arrastrá los seis puntos para reordenar campos y secciones o mover campos entre secciones. Las flechas y el selector de sección permiten los mismos cambios sin arrastrar.

Elegí **Este informe** para aplicar los cambios al informe abierto, o **Nuevos informes** para guardar la plantilla que usarán los próximos informes. Cada informe conserva su propia plantilla. El Word respeta sus campos y su orden; los obligatorios pendientes impiden exportar y se indican en el mensaje.

Quitar un campo o sección lo oculta del formulario y del Word, conservando sus valores guardados. Usá **Deshacer** para revertir cambios de estructura durante la edición. La plantilla del informe se incluye en sus respaldos y versiones; la plantilla para nuevos informes se guarda en `informe-qa/data/templates/`. Conservá toda la carpeta `data` al mover la aplicación.

## Iniciar

Requiere Node.js 22 o superior.

```powershell
cd informe-qa
npm ci
npm run build
npm start
```

Abrir http://localhost:4310. Después de la primera instalación también se puede ejecutar `informe-qa/Iniciar.cmd` en Windows.

## Datos

Los informes, capturas, bugs e historial se guardan localmente en `informe-qa/data/`. Esa carpeta no forma parte del repositorio: conservarla al actualizar y usar Respaldo para trasladar datos a otro equipo.

Las credenciales van en variables de entorno o en `.env.local`, también excluido de Git. Hay un ejemplo sin credenciales en `informe-qa/.env.example`.

## Comprobar

```powershell
cd informe-qa
npm test
```

Más detalles en [informe-qa/README.md](informe-qa/README.md).
