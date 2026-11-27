import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const local = join(root, '.local');
export const buildRoot = join(root, '.build');
export const dataRoot = join(root, 'datos');
export const libraryPath = join(dataRoot, 'biblioteca.json');
export const port = 47822;
export const localAddress = `http://127.0.0.1:${port}`;
export const packageInfo = () => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
export const hash = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const readJSON = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const files = path => existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name).sort() : [];
export function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.trazo-${randomUUID()}`);
  let fd;
  try {
    fd = openSync(temp, 'wx', 0o600);
    writeFileSync(fd, content); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temp, path);
  } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp); }
}
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr?.trim() || `No se completó ${command} (código ${result.status}).`);
  return result.stdout?.trim() ?? '';
}
export function acquireLock(label) {
  mkdirSync(local, { recursive: true });
  const path = join(local, 'operacion.lock');
  try { mkdirSync(path); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = readJSON(join(path, 'owner.json')); } catch { throw new Error('Hay un arranque en curso o quedó un bloqueo incompleto en .local/operacion.lock.'); }
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (failure) { if (failure.code === 'ESRCH') alive = false; }
    if (alive) throw new Error(`Trazo ya está abierto (${owner.label}). Usá ${localAddress} en el navegador.`);
    // Only a proven dead PID permits removal of this exact application lock.
    rmSync(path, { recursive: true });
    mkdirSync(path);
  }
  const token = randomUUID();
  atomicWrite(join(path, 'owner.json'), json({ pid: process.pid, label, token }));
  return () => {
    if (existsSync(path) && readJSON(join(path, 'owner.json')).token === token) rmSync(path, { recursive: true });
  };
}
export function assertNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24 || major >= 27) throw new Error('Esta versión necesita Node.js 24 LTS (o 26). Actualizá Node en esta PC antes de continuar.');
}
export function document(value) {
  if (value?.mode !== undefined && !['analysis', 'design', 'uml', 'pert'].includes(value.mode)) throw new Error('El modo del proyecto es incompatible. Se conservó sin modificar.');
  if (!value || value.format !== 'trazo-dfd' || ![1, 2, 3].includes(value.version) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !Array.isArray(value.diagrams) || !value.diagrams.length || !value.diagrams.some(d => d.id === value.activeDiagramId)) throw new Error('Hay un proyecto incompatible o dañado. Se conservó sin modificar.');
  for (const d of value.diagrams) if (!d || typeof d.id !== 'string' || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error('Hay un diagrama inválido. Se conservó sin modificar.');
  return value;
}
export function checkLibrary() {
  const manifest = readJSON(libraryPath);
  const version = packageInfo().version.split('.').map(Number);
  const minimum = String(manifest.minimumAppVersion).split('.').map(Number);
  if (minimum.length !== 3 || minimum.some(n => !Number.isInteger(n) || n < 0)) throw new Error('El contrato de la biblioteca no es válido. No se modificaron datos.');
  const older = version[0] !== minimum[0] ? version[0] < minimum[0] : version[1] !== minimum[1] ? version[1] < minimum[1] : version[2] < minimum[2];
  if (manifest.storageVersion !== 1 || older || JSON.stringify(manifest.projectVersions) !== '[1,2,3]') throw new Error('Esta biblioteca necesita una versión compatible de Trazo. Conservá la carpeta de datos y actualizá la aplicación.');
  return manifest;
}
// Cumulative, metadata-only upgrade. The caller holds the application lock;
// an exact backup is durable before the minimum reader version changes.
export function prepareLibrary() {
  const required = '1.35.0';
  if (!existsSync(libraryPath)) {
    if (existsSync(dataRoot) && readdirSync(dataRoot).length) throw new Error('La carpeta de datos tiene contenido, pero le falta biblioteca.json. Conservá la carpeta y recuperá su manifiesto.');
    atomicWrite(libraryPath, json({ storageVersion: 1, projectVersions: [1, 2, 3], minimumAppVersion: required }));
  }
  const manifest = checkLibrary();
  const current = String(manifest.minimumAppVersion).split('.').map(Number), target = required.split('.').map(Number);
  const older = current[0] !== target[0] ? current[0] < target[0] : current[1] !== target[1] ? current[1] < target[1] : current[2] < target[2];
  if (!older) return;
  const raw = readFileSync(libraryPath, 'utf8');
  const backup = join(dataRoot, 'respaldos', 'contrato-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.json');
  atomicWrite(backup, raw);
  if (readFileSync(backup, 'utf8') !== raw) throw new Error('No se pudo confirmar el respaldo del contrato. La biblioteca se conservó.');
  atomicWrite(libraryPath, json({ ...manifest, minimumAppVersion: required }));
}
