import { randomBytes, randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, json, local, localAddress } from './common.mjs';
import { StorageError } from './storage.mjs';
import { tools } from '../../mcp/tools.mjs';

// Ephemeral broker only: every editor mutation happens through EditorStore.
export function createAutomation({ version, session, storage, respond, assertCurrent }) {
  const token = randomBytes(32).toString('hex'), tabs = new Map(), pending = new Map();
  const connectionPath = join(local, 'mcp-connection.json');
  atomicWrite(connectionPath, json({ address: localAddress, token }));
  const alive = () => [...tabs.values()].filter(tab => Date.now() - tab.seen < 6000);
  const finish = (job, result, error) => {
    clearTimeout(job.timer); pending.delete(job.id);
    if (!job.res.destroyed) respond(job.res, error ? 409 : 200, error ? { error } : result);
  };
  const readBody = async req => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new StorageError('Se requiere JSON.', 415);
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw new StorageError('Pedido MCP demasiado grande.', 413);
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StorageError('Pedido inválido.');
    return body;
  };
  return {
    async handle(req, res, pathname) {
      if (req.method !== 'POST') throw new StorageError('Método no permitido.', 405);
      if (req.headers['x-trazo-version'] !== version) throw new StorageError('Volvé a abrir Trazo y reiniciá su MCP: cambió la versión.', 409);
      const fromMcp = pathname === '/api/automation/call';
      if (fromMcp ? req.headers.authorization !== `Bearer ${token}` : req.headers['x-trazo-session'] !== session) throw new StorageError('Sesión de automatización inválida.', 403);
      assertCurrent();
      const body = await readBody(req); assertCurrent();
      if (pathname === '/api/automation/poll') {
        if (typeof body.tabId !== 'string' || body.tabId.length > 200 || !body.tabId || typeof body.active !== 'boolean') throw new StorageError('Pestaña inválida.');
        for (const [id, tab] of tabs) if (Date.now() - tab.seen > 6000) tabs.delete(id);
        if (!tabs.has(body.tabId) && tabs.size >= 32) throw new StorageError('Demasiadas pestañas conectadas.');
        const tab = { tabId: body.tabId, active: body.active, busy: !!body.busy,
          projectId: String(body.projectId ?? '').slice(0, 200), projectName: String(body.projectName ?? '').slice(0, 4000),
          diagramId: String(body.diagramId ?? '').slice(0, 200), seen: Date.now() };
        tabs.set(tab.tabId, tab);
        const job = [...pending.values()].find(job => job.tabId === tab.tabId && !job.delivered);
        if (job) job.delivered = true;
        respond(res, 200, { job: job ? { id: job.id, name: job.name, args: job.args, expiresAt: job.expiresAt } : null }); return;
      }
      if (pathname === '/api/automation/result') {
        const job = pending.get(body.id);
        if (job && job.tabId === body.tabId) {
          assertCurrent(); finish(job, body.result, typeof body.error === 'string' ? body.error : undefined);
        }
        respond(res, 200, { received: !!job }); return;
      }
      if (!fromMcp) throw new StorageError('Operación no disponible.', 404);
      const definition = tools.find(tool => tool.name === body.name);
      if (!definition) throw new StorageError('Herramienta desconocida.');
      const args = body.args ?? {}, schema = definition.inputSchema;
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(schema.properties, key)) || schema.required.some(key => args[key] === undefined)) throw new StorageError('Argumentos inválidos o incompletos.');
      for (const [key, value] of Object.entries(args)) if (schema.properties[key].type === 'string' && (typeof value !== 'string' || !value.trim() || value.length > schema.properties[key].maxLength)) throw new StorageError(`Argumento inválido: ${key}`);
      if (body.name === 'trazo_estado') { respond(res, 200, { tabs: alive(), help: 'Abrí Trazo y elegí DFD de diseño. Si hay varias pestañas, usar sessionId=tabId explícito.' }); return; }
      if (body.name === 'trazo_listar_proyectos') {
        const projects = storage('list', {}).records.map(record => record.project).filter(p => p.mode === 'design');
        respond(res, 200, { projects: projects.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt,
          diagrams: p.diagrams.map(d => ({ id: d.id, name: d.name })) })) }); return;
      }
      const candidates = alive().filter(tab => tab.active && (!args.sessionId || tab.tabId === args.sessionId));
      if (candidates.length !== 1) throw new StorageError(candidates.length ? 'Hay varias pestañas de diseño. Elegí sessionId con trazo_estado.' : 'Abrí Trazo y elegí DFD de diseño; la pestaña solicitada no está disponible.', 409);
      const tab = candidates[0];
      if (tab.busy && !definition.annotations.readOnlyHint) throw new StorageError('El editor está ocupado. Terminá la edición o cerrá el diálogo.', 409);
      if ([...pending.values()].some(job => job.tabId === tab.tabId)) throw new StorageError('Hay un pedido en curso en esta pestaña. Esperá su resultado.', 409);
      const id = randomUUID(), expiresAt = Date.now() + 20000;
      const job = { id, tabId: tab.tabId, name: body.name, args, expiresAt, res, delivered: false };
      job.timer = setTimeout(() => finish(job, null, 'El pedido expiró sin confirmación. Leé el diagrama antes de reintentar para evitar duplicados.'), 25000);
      pending.set(id, job);
      res.once('close', () => { if (pending.has(id)) { clearTimeout(job.timer); pending.delete(id); } });
    },
    close() {
      for (const job of pending.values()) finish(job, null, 'Se cerró Trazo. Leé el diagrama antes de reintentar.');
      try { unlinkSync(connectionPath); } catch { /* Already removed. */ }
    },
  };
}
