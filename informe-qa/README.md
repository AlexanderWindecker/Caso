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

## Proyectos del informe

El campo Proyecto ofrece inicialmente solo Cobranza de facturas (CF), Gestor unificado de valores (GUV) y Datos históricos nuevo (DH), además de la opción vacía de selección. No se agregan automáticamente los textos antiguos del informe al desplegable. Esos valores se conservan internamente y se muestran como una nota hasta que se elija una opción configurada.

La selección se conserva en el campo existente `app`, se aplica a todos los casos del informe y se incluye en las exportaciones con la etiqueta configurada. No se asigna automáticamente un proyecto a partir del nombre de un módulo.

## Encabezado editable desde Mis plantillas

Para configurar el encabezado del informe abierto: **Mis plantillas → Editar para este informe → Encabezado**. Se pueden cambiar etiquetas, tipos de campo, opciones de desplegables, valores predeterminados de los selectores, obligatoriedad, visibilidad y orden; también agregar campos personalizados o quitar campos conservando sus datos.

Para mantener una configuración reutilizable: editar una plantilla de la biblioteca, ir a **Encabezado** y guardar. Luego usar **Aplicar a este informe** para actualizar el informe abierto, o elegir esa plantilla al crear uno nuevo. Cambiar una plantilla de biblioteca no modifica automáticamente los informes existentes. Aplicar una plantilla conserva los valores ya completados.

Las opciones de Proyecto se editan en su cuadro **Opciones: una por línea**. Por ejemplo, `Cobranza de facturas (CF)`. Proyecto se mantiene como un desplegable. Los proyectos adicionales pueden usarse para documentar informes; habilitar su publicación en Jira requiere agregar el perfil correspondiente al orquestador y a las herramientas MCP, que actualmente permiten CF, GUV y DH.

La estructura reside en `template.header.sections`. Los campos originales usan `app`, `environment`, `version`, `author` y `ticket`; los valores personalizados se conservan en `report.headerValues`. La configuración y los valores se incluyen en respaldos e historial. Las etiquetas, el orden y la visibilidad se respetan en la vista previa y en Word; los campos obligatorios se validan al exportar. Los bugs mantienen su ticket relacionado propio.

Archivos: `src/report-header.js` define y dibuja el encabezado; `src/template-editor.js` lo edita; `src/templates.js` valida su estructura; `src/template-library.js` permite aplicar las plantillas guardadas. `src/projects.js` contiene únicamente el catálogo inicial de los tres proyectos.

## Publicación de bugs en Jira

Cada bug activo, tanto independiente como asociado a un caso, dispone de **Crear ticket en Jira**. El circuito es: guardar el bug, preparar la vista previa, completar los campos Jira, seleccionar evidencias y confirmar **Crear ticket en Jira**. Si se modifica un selector o una evidencia, primero hay que actualizar la vista previa. Preparar y revisar no crea tickets.

El servidor local inicia un cliente MCP propio; no requiere que Copilot ni el chat de Codex estén abiertos. Reutiliza la extensión instalada **Atlassian Private MCP Server 0.2.0**, adaptada para Jira, y las credenciales configuradas en los ajustes de usuario de VS Code. También admite `JIRA_BASE_URL` y `JIRA_PAT` como variables de entorno del servidor, sin enviarlas al navegador. Después de actualizar el código, reiniciar el servicio local y recargar el navegador.

Los agentes de esta primera versión son módulos ejecutables de preparación y validación basados en reglas. No generan información con un modelo de IA ni necesitan una credencial de OpenAI. El orquestador selecciona un agente según el proyecto explícito del bug o el proyecto del informe; los tres perfiles comparten las reglas generales. Los nombres de componentes y versiones no se deducen: se cargan desde Jira y se envían sus identificadores.

| Archivo | Responsabilidad / dónde modificar |
| --- | --- |
| `scripts/jira/agents/orchestrator.mjs` | Derivación del bug a CF, GUV o DH y consulta de sus metadatos. |
| `scripts/jira/agents/cf.mjs`, `guv.mjs`, `dh.mjs` | Perfiles separados de cada proyecto. |
| `scripts/jira/agents/project-agent.mjs` | Validaciones comunes, correspondencia de severidad, campos Jira y composición de descripción. |
| `scripts/jira/mcp-tools.mjs` | Herramientas MCP para metadatos completos, creación de defectos, reconciliación y adjuntos. |
| `scripts/jira/mcp-client.mjs` | Cliente MCP local del servidor de la aplicación. |
| `scripts/jira/publications.mjs` | Preparaciones, publicación, registro persistente y reintentos. |
| `src/jira-panel.js` | Formulario de revisión, selección de evidencias y presentación del resultado. |
| `src/jira.js` | Datos Jira permitidos en los bugs y selección de evidencias. |

El tipo de incidencia es **Defecto**. Se cargan desde Jira tipo de defecto, componente, criticidad y **versiones afectadas**, con el usuario conectado como informador. Severidad local `Crítica` corresponde a `Crítico` de Jira. Se propone Testing para el ambiente. En proyectos que no exponen Ambiente en el formulario de creación (GUV en la verificación inicial), se documenta en la descripción. La descripción también reúne los pasos, esperado, obtenido, ticket relacionado y epígrafes de evidencias. Se exige al menos una evidencia, aunque el servidor Jira no la marque obligatoria en metadatos.

El campo local **Ticket relacionado** conserva su valor. El defecto creado se guarda aparte como `bug.jiraPublication`; las selecciones de Jira se guardan como `bug.jiraDraft`. Ambos se conservan en respaldos e historial. Duplicar un caso elimina el vínculo de Jira de la copia. El registro de publicación reside en `data/jira-publications/` y debe conservarse al mover la aplicación.

Si Jira crea el ticket pero falla un adjunto, **Reintentar adjuntos** utiliza ese mismo ticket. Las evidencias reciben nombres con una referencia y una huella de contenido para reconocer cargas previas. Si se pierde la respuesta al crear, se conserva el estado **Resultado por confirmar** y se busca una referencia de publicación incluida en la descripción. No se vuelve a crear mientras el resultado siga siendo incierto. Una restauración que ya contiene un vínculo de Jira también conserva ese ticket.

Diagnóstico de conexión (solo lecturas, no publica tickets):

```powershell
node scripts/jira/check-connection.mjs
```

Las pruebas automatizadas de creación y adjuntos usan Jira simulado. Para revisar visualmente ese entorno aislado, compilar y ejecutar `node tests/fixtures/jira-server.mjs`; escucha en `http://127.0.0.1:4312` y usa almacenamiento temporal. La publicación individual está implementada; los lotes y la redacción mediante modelos de IA quedan para una etapa posterior.

## Chat Jira con la sesión local de Codex

En la barra lateral, **Chat Jira** abre el asistente de consulta. Usa la sesión ChatGPT ya iniciada en Codex en este equipo, con los límites y permisos de esa cuenta. No requiere una API key adicional para esta integración local. Las consultas y los resultados necesarios de Jira se envían a Codex para elaborar la respuesta. Esta integración local no es un servicio compartido con una cuenta para todo el equipo.

Después de actualizar, cerrar el servicio local anterior, ejecutar `Iniciar.cmd` y recargar el navegador. Abrir **Chat Jira → Comprobar conexión**. Si falta la sesión, iniciar sesión en la extensión Codex de VS Code y comprobar nuevamente.

Ejemplos: «Mostrame mis asignaciones», «Mostrame mis defectos en Resolved o Resuelta», «¿Qué tickets me asignaron hoy?» o «¿Qué cambió en DH-442?». Se muestran respuestas, enlaces a los tickets consultados y el JQL utilizado con el total y los resultados de cada página. Los estados y el historial determinan qué puede afirmarse: un estado Resolved por sí solo no prueba una devolución de Desarrollo. Los historiales incompletos se indican al asistente.

Para consultas generales sobre mis asignaciones, `jira_assigned` consulta `assignee = currentUser()` sin excluir estados, categorías, tipos o proyectos. Los filtros se aplican cuando el usuario los solicita expresamente. Las respuestas muestran claves de ticket en lugar de URLs; la lista conserva los enlaces clickeables. `src/jira-chat-text.js` elimina las URLs y las marcas de formato del texto visible.

La conversación permanece en memoria de la pestaña y del servicio; no se agrega a los informes, respaldos ni biblioteca. **Nueva conversación** descarta el contexto del chat. Recargar la pestaña o reiniciar el servicio inicia otra conversación; las sesiones del backend caducan después de una hora sin uso. Cada conversación admite hasta 40 mensajes y cada mensaje hasta 12 consultas de Jira. El chat escrito es la primera etapa; todavía no incluye voz.

Archivos principales:

| Archivo | Función |
| --- | --- |
| `src/jira-chat.js` | Panel, consultas sugeridas, estado de conexión y enlaces seguros. |
| `scripts/jira/codex-chat.mjs` | Protocolo oficial App Server por stdio, sesión existente y conversaciones efímeras. |
| `scripts/jira/chat-service.mjs` | Rutas `/api/chat/`, sesiones y control de consultas. |
| `scripts/jira/chat-tools.mjs` | Usuario, búsqueda JQL, detalle e historial, proyectos y estados: solo GET. |
| `scripts/jira/check-chat.mjs` | Diagnóstico local. `--smoke` consume una consulta de Codex y lee únicamente el usuario de Jira. |
| `tests/jira-chat.test.mjs` | Verifica lectura, aislamiento de publicaciones, protocolo, sesiones y controles de origen. |

La regla obligatoria de solo consulta está en `chatReadOnlyRule`, dentro de `scripts/jira/chat-tools.mjs`, y se suministra al asistente como instrucción de desarrollador. Prohíbe crear, editar, eliminar, cambiar estados o asignaciones y agregar comentarios o adjuntos, incluso si se solicita una excepción o se confirma una modificación. También se muestra un aviso permanente en el chat.

El chat no expone las herramientas de publicación. Deshabilita los MCP y plugins heredados para sus conversaciones y usa herramientas de lectura suministradas por el backend, con terminal, navegador y escritura deshabilitados. Las preferencias globales de Codex y VS Code no se modifican; las credenciales no llegan al navegador ni se incluyen en el prompt.

Se detecta `codex.exe` en la extensión de VS Code para Windows o se busca `codex` en PATH. Si hace falta, configurar `QA_CODEX_BIN` con su ruta absoluta en `.env.local`. El modelo se obtiene del catálogo de Codex; `QA_CHAT_MODEL` permite seleccionar explícitamente otro disponible. El inicio de sesión no garantiza que el proveedor habilite un modelo: la ejecución confirma el acceso efectivo. No copiar archivos de autenticación a la aplicación.

Documentación: [Codex App Server](https://learn.chatgpt.com/docs/app-server). Una distribución alojada o comercial requiere revisar el mecanismo de [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) correspondiente.

## Almacenamiento y actualizaciones

La sincronización de la caché reconoce versiones ya guardadas en Historial y no las convierte en informes nuevos. Un borrador con la revisión vigente se guarda sobre su informe; un borrador divergente se recupera una sola vez, incluso si se reenvía desde varias pestañas. Las diferencias de fecha de actualización por sí solas no generan copias.

`node scripts/reconcile-browser-copies.mjs` muestra las copias del navegador cuyo contenido coincide con una versión histórica de un original activo. Con `--apply` se archivan esas copias mediante Historial, conservando sus versiones y evidencias; se registra la operación en `recovery/`. Los borradores con contenido diferente se mantienen.

La aplicación funciona localmente y conserva sus datos en `data/`. Esa carpeta contiene informes, versiones y evidencias: conservarla al mover o actualizar la aplicación. El servicio escucha solo en este equipo. `data/`, `recovery/`, exportaciones y credenciales quedan excluidos del repositorio.
