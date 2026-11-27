# MCP local de Trazo

El servidor se comunica por `stdio` con el cliente MCP. Las herramientas de edición actúan sobre la pestaña activa de **DFD de diseño**. Trazo mantiene el historial de deshacer y confirma el guardado mediante el mismo mecanismo que usa al editar a mano.

## Configurar en Codex

Abrí una terminal PowerShell en la raíz de Trazo. Si descargaste el ZIP portable, usá el Node.js incluido. Si compilaste desde el código, usá el Node.js de tu PATH.

```powershell
$trazoMcp = (Resolve-Path -LiteralPath './mcp/server.mjs').Path
$trazoNode = if (Test-Path -LiteralPath './runtime/node.exe') {
  (Resolve-Path -LiteralPath './runtime/node.exe').Path
} else {
  (Get-Command node -CommandType Application).Source
}
codex mcp add trazo-publico -- "$trazoNode" "$trazoMcp"
codex mcp get trazo-publico
```

Abrí Trazo, entrá en **DFD de diseño** y comenzá una sesión de Codex. Pedile que consulte `trazo_estado` y lea el diagrama activo sin editarlo. Si cambiaste la ubicación de la carpeta, actualizá las rutas del registro.

Para otro cliente con soporte de `stdio`, configurá la ruta absoluta al ejecutable de Node.js como comando y la ruta absoluta a `mcp/server.mjs` como argumento. Usá el servidor que acompaña a esa instalación de Trazo. [Documentación de MCP en Codex](https://developers.openai.com/codex/mcp)

## Usar las herramientas

- Consultá `trazo_estado`, identificá la pestaña de diseño y leé el diagrama con `trazo_leer_diagrama` antes de solicitar cambios.
- Referí figuras, flujos y diagramas por ID. Usá la revisión devuelta por la última lectura. Si hay varios elementos con el mismo nombre, confirmá con la persona cuál quiere cambiar.
- Agrupá los cambios relacionados en un lote con `trazo_aplicar`. Volvé a leer el diagrama si hay un error, un tiempo de espera o una revisión desactualizada antes de repetir una edición.
- Si el MCP no encuentra una pestaña, abrí **DFD de diseño** y cerrá los diálogos abiertos. Con varias pestañas, indicá el `sessionId` que devuelve `trazo_estado`.

Para construir o revisar diagramas con las convenciones del método, empezá por la [guía de DFD de diseño para IA](../docs/trazo-ia/README.md).
