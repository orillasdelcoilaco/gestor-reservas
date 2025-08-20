==> Ejecutando 'nodo index.js'
==> Salió con el estado 1
==> Formas comunes de solucionar problemas de implementación: https://render.com/docs/troubleshooting-deploys
==> Ejecutando 'nodo index.js'
nodo:interno/módulos/cjs/cargador:1404
  tirar err;
  ^
Error: No se puede encontrar el módulo '.. /utils/helpers'
Requerir pila:
- /opt/render/project/src/backend/services/contactsService.js
- /opt/render/project/src/backend/routes/contactos.js
- /opt/render/project/src/backend/index.js
  en Function._resolveFilename (node:internal/modules/cjs/loader:1401:15)
  en defaultResolveImpl (node:internal/modules/cjs/loader:1057:19)
  en resolveForCJSWithHooks (node:internal/modules/cjs/loader:1062:22)
  en Function._load (node:internal/modules/cjs/loader:1211:37)
  en TracingChannel.traceSync (nodo:diagnostics_channel:322:14)
  en wrapModuleLoad (node:internal/modules/cjs/loader:235:24)
  en Module.require (node:internal/modules/cjs/loader:1487:12)
  en requerir (node:internal/modules/helpers:135:16)
  en Object.<anonymous> (/opt/render/project/src/backend/services/contactsService.js:2:30)
  en Module._compile (node:internal/modules/cjs/loader:1730:14) {
  código: «MODULE_NOT_FOUND»,
  requireStack: [
    '/opt/render/project/src/backend/services/contactsService.js',
    '/opt/render/project/src/backend/routes/contactos.js',
    '/opt/render/project/src/backend/index.js'
  ]
}
Node.js v22.16.0