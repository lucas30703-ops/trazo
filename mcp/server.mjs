import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { tools } from './tools.mjs';
import { localAddress, packageInfo } from '../scripts/local/common.mjs';

// Standalone stdio: stdout belongs exclusively to MCP. The browser editor
// remains the only writer of Trazo documents and applies every mutation via
// EditorStore before its regular autosave queue confirms disk persistence.
const connectionFile = new URL('../.local/mcp-connection.json', import.meta.url);
const version = packageInfo().version;

function schemaToZod(schema) {
  let value;
  if (schema.type === 'object') {
    const required = new Set(schema.required ?? []), shape = {};
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      const field = schemaToZod(property);
      shape[key] = required.has(key) ? field : field.optional();
    }
    value = z.object(shape);
    if (schema.additionalProperties === false) value = value.strict();
  } else if (schema.type === 'array') {
    value = z.array(schemaToZod(schema.items));
    if (schema.maxItems !== undefined) value = value.max(schema.maxItems);
  } else if (schema.type === 'string') {
    value = schema.enum ? z.enum(schema.enum) : z.string();
    if (!schema.enum && schema.minLength !== undefined) value = value.min(schema.minLength);
    if (!schema.enum && schema.maxLength !== undefined) value = value.max(schema.maxLength);
    if (!schema.enum && schema.pattern !== undefined) value = value.regex(new RegExp(schema.pattern));
  } else if (schema.type === 'integer' || schema.type === 'number') {
    value = z.number().finite();
    if (schema.type === 'integer') value = value.int();
    if (schema.minimum !== undefined) value = value.min(schema.minimum);
    if (schema.maximum !== undefined) value = value.max(schema.maximum);
    if (schema.exclusiveMinimum !== undefined) value = value.gt(schema.exclusiveMinimum);
    if (schema.exclusiveMaximum !== undefined) value = value.lt(schema.exclusiveMaximum);
  } else {
    throw new Error(`Esquema MCP no admitido: ${schema.type ?? 'sin tipo'}`);
  }
  return schema.description ? value.describe(schema.description) : value;
}

async function call(name, args, signal) {
  let connection;
  try { connection = JSON.parse(readFileSync(connectionFile, 'utf8')); }
  catch { throw new Error('Abrí Trazo y elegí DFD de diseño antes de llamar al MCP.'); }
  if (connection.address !== localAddress || typeof connection.token !== 'string' || connection.token.length < 32) {
    throw new Error('Conexión local inválida. Volvé a abrir Trazo.');
  }
  let response;
  try {
    const timeout = AbortSignal.timeout(30_000);
    const requestSignal = signal && typeof signal.addEventListener === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
    response = await fetch(connection.address + '/api/automation/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connection.token}`, 'X-Trazo-Version': version },
      body: JSON.stringify({ name, args }),
      signal: requestSignal,
    });
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
    throw new Error(`No se confirmó la operación. Comprobá que Trazo siga abierto. Leé el diagrama antes de reintentar para evitar duplicados.${detail}`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Trazo devolvió una respuesta local inválida. Volvé a abrir la aplicación antes de reintentar.'); }
  if (!response.ok) throw new Error(result.error || 'No se confirmó la operación.');
  return result;
}

function createServer() {
  const server = new McpServer(
    { name: 'trazo-diseno', version },
    {
      instructions: [
        'Maneja DFD de diseño de Trazo. Primero comprueba la pestaña, lista/abre por ID y lee el diagrama. Toda escritura usa IDs reales y expectedRevision. Si un nombre coincide con varios proyectos, diagramas o elementos, muestra los candidatos y espera que el usuario elija.',
        'Puede crear/editar/mover/eliminar procesos, pantallas, tablas, textos y flujos, cambiar sus colores, reconectar flujos, gestionar diagramas/especificaciones y deshacer por pedido explícito. Los colores se cambian solo cuando el usuario lo pide. Conserva cada color omitido.',
        'Para curvar con precisión, lee curve y sourcePoint/targetPoint. Usa trazo_aplicar con curve.controls y/o curve.waypoints solo en los flujos solicitados. Si hay una curva de referencia, lee su geometría y adapta las coordenadas a los anclajes del destino. Una edición posterior de estilo conserva el trazado.',
        'Al ordenar varios flujos incidentes, trazo_ordenar_flujos reparte puertos y etiquetas por figura focal. Limita flowIds a los que deben redistribuirse y conserva las curvas ajustadas a mano salvo que el usuario pida reemplazarlas. Conserva la posición del proceso salvo pedido expreso.',
        'Cuando el usuario pida organizar un DFD denso, propone primero un cambio mínimo que mantenga pantallas a la izquierda, procesos en el centro, tablas a la derecha y una escala de lectura útil. Conserva por defecto posiciones, tamaños y modos de recorrido. Mantén directas o curvas las conexiones cortas y las de pantalla-proceso.',
        'Usa carriles ortogonales solo para un subconjunto largo o congestionado, en grupos pequeños por proceso. Separa sus corredores y usa labelOrientation=horizontal sobre tramos horizontales. Relee y revisa el resultado de cada grupo antes de ampliar el cambio. Crece hacia abajo solo lo necesario.',
        'Mantén los flujos individuales. Edita mediante las herramientas de Trazo. Eliminar, renombrar y reconectar requieren un pedido explícito. Tras un resultado incierto, vuelve a leer antes de repetir.',
      ].join(' '),
    },
  );
  for (const definition of tools) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: schemaToZod(definition.inputSchema),
        annotations: definition.annotations,
      },
      async (args, context) => {
        try {
          const result = await call(definition.name, args, context.signal);
          return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (failure) {
          return { isError: true, content: [{ type: 'text', text: failure instanceof Error ? failure.message : 'Falló la operación local de Trazo.' }] };
        }
      },
    );
  }
  return server;
}

serveStdio(createServer, { onerror: error => console.error(`Trazo MCP: ${error.message}`) });
