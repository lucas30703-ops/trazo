import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { root, buildRoot, libraryPath, localAddress as address, port, packageInfo } from './common.mjs';
import { createStorage, StorageError } from './storage.mjs';
import { createAutomation } from './automation.mjs';

export async function serve() {
  const { parseProject } = await import(pathToFileURL(join(buildRoot, 'model.mjs')).href);
  const storage = createStorage(parseProject), version = packageInfo().version, session = randomUUID();
  const manifest = readFileSync(libraryPath, 'utf8');
  const assertCurrent = () => {
    if (readFileSync(libraryPath, 'utf8') !== manifest) throw new StorageError('La biblioteca cambió mientras Trazo estaba abierto. Cerrá sus pestañas y volvé a abrir Trazo.', 409, 'incompatible');
  };
  const dist = join(root, 'dist');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  const respond = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const automation = createAutomation({ version, session, storage, respond, assertCurrent });
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (req.headers.host !== `127.0.0.1:${port}` || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new StorageError('Trazo solo acepta conexiones desde esta PC.', 403);
      if (req.headers.origin && req.headers.origin !== address) throw new StorageError('Origen no permitido.', 403);
      const url = new URL(req.url, address);
      if (url.pathname.startsWith('/api/automation/')) { await automation.handle(req, res, url.pathname); return; }
      if (url.pathname === '/api/storage') {
        if (!['GET', 'POST'].includes(req.method)) throw new StorageError('Método no permitido.', 405);
        if (req.headers['x-trazo-version'] !== version) throw new StorageError('La aplicación fue actualizada. Recargá esta pestaña antes de continuar.', 409, 'incompatible');
        assertCurrent();
        let input = {}, action = url.searchParams.get('action') || 'list';
        if (req.method === 'POST') {
          if (req.headers['x-trazo-session'] !== session) throw new StorageError('Esta pestaña pertenece a una sesión anterior. Descargá los cambios pendientes y recargá Trazo.', 409, 'conflict');
          if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new StorageError('Se requiere JSON.', 415);
          let size = 0; const chunks = [];
          for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) throw new StorageError('El proyecto supera 32 MiB. Descargá una copia editable.', 413); chunks.push(chunk); }
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StorageError('Solicitud inválida.');
          action = input.action;
          if (!['save', 'delete', 'checkpoint'].includes(action)) throw new StorageError('Operación no permitida.');
        } else {
          if (!['list', 'history'].includes(action)) throw new StorageError('Operación no permitida.');
          input.id = url.searchParams.get('id');
        }
        if (req.method === 'POST') assertCurrent();
        respond(res, 200, { ...storage(action, input), session }); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new StorageError('Método no permitido.', 405);
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const path = resolve(dist, '.' + relative);
      if (!path.startsWith(dist + sep) || relative.split(/[\\/]/).some(p => p.startsWith('.')) || !mime[extname(path)] || !existsSync(path)) throw new StorageError('Archivo no encontrado.', 404);
      const body = readFileSync(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)], 'Content-Length': body.length, 'Cache-Control': extname(path) === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (!res.headersSent) respond(res, error.status || 500, { error: error.message || 'No se pudo completar la operación.', code: error.code });
      else res.destroy();
    }
  });
  server.requestTimeout = 15000;
  try { await new Promise((resolveStart, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveStart); }); }
  catch (error) { automation.close(); throw error; }
  console.log(`Trazo ${version} · ${address}\nEsperá “Guardado en esta PC” antes de cerrar las pestañas y detener Trazo (Ctrl+C).`);
  if (process.platform === 'win32' && process.env.TRAZO_NO_BROWSER !== '1') {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', address], { windowsHide: true, detached: true, stdio: 'ignore' });
    browser.on('error', () => console.log(`Abrí ${address} en el navegador.`)); browser.unref();
  }
  await new Promise(resolveStop => {
    let closing = false;
    const close = () => { if (closing) return; closing = true; automation.close(); server.close(resolveStop); server.closeIdleConnections(); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
  });
}
