# Caso · Informes QA

Aplicación local para documentar casos de prueba, adjuntar evidencias y generar informes Word. Incluye bugs vinculados a casos o independientes, favoritos y recuperación de versiones.

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
