import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataRoot, local, hash, json, readJSON, files, atomicWrite, document, checkLibrary } from './common.mjs';

export class StorageError extends Error {
  constructor(message, status = 400, code) { super(message); this.status = status; this.code = code; }
}
export function createStorage(parseProject) {
  const projectPath = id => join(dataRoot, 'proyectos', hash(id) + '.dfd.json');
  const historyPath = id => join(dataRoot, 'versiones', hash(id));
  const deletedPath = id => join(dataRoot, 'eliminados', hash(id) + '.json');
  function validate(value) {
    if (value?.format === 'trazo-dfd' && ![1, 2, 3].includes(value.version)) throw new StorageError('Un proyecto necesita una versión de Trazo más nueva. Actualizá antes de abrirlo.', 409, 'incompatible');
    document(value); parseProject(value);
    return value; // Validate with the editor schema, preserve the complete original document.
  }
  function record(path) {
    const raw = readFileSync(path, 'utf8');
    let project, recovered = false;
    try { project = validate(JSON.parse(raw)); }
    catch (error) {
      if (error.code === 'incompatible') throw error;
      if (!existsSync(path + '.anterior')) throw new StorageError('Hay un proyecto dañado sin copia anterior. No se reemplazó por un ejemplo.', 500);
      project = validate(readJSON(path + '.anterior')); recovered = true;
    }
    if (path !== projectPath(project.id)) throw new StorageError('El identificador de un proyecto no coincide con su archivo. Conservá el archivo y revisá la biblioteca.', 500);
    return { project, etag: hash(raw), savedAt: statSync(path).mtime.toISOString(), recovered };
  }
  function revisions(id) {
    return files(historyPath(id)).filter(f => f.endsWith('.json')).map(f => {
      const revision = readJSON(join(historyPath(id), f));
      validate(revision.project);
      if (revision.projectId !== id || revision.project.id !== id || typeof revision.savedAt !== 'string' || typeof revision.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(revision.id) || f !== revision.id + '.json') throw new StorageError('Una versión recuperable está dañada. No se eliminó.', 500);
      return revision;
    }).sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
  }
  function checkpoint(p, reason, automatic = false, fixedId) {
    validate(p);
    const id = fixedId ?? randomUUID();
    const path = join(historyPath(p.id), id + '.json');
    if (existsSync(path)) return readJSON(path);
    const revision = { id, projectId: p.id, savedAt: new Date().toISOString(), reason, automatic: automatic ? 1 : 0, project: p };
    atomicWrite(path, json(revision));
    return revision;
  }
  function conflict(p, message) {
    checkpoint(p, 'Cambios conservados por conflicto', false, 'conflicto-' + hash(json(p)));
    throw new StorageError(message + ' Tus cambios están en Versiones recuperables; podés conservarlos como otro proyecto.', 409, 'conflict');
  }
  return function storage(action, input = {}) {
    checkLibrary();
    if (action === 'list') {
      const deletedIds = files(join(dataRoot, 'eliminados')).filter(f => f.endsWith('.json')).map(f => readJSON(join(dataRoot, 'eliminados', f)).id);
      const records = files(join(dataRoot, 'proyectos')).filter(f => f.endsWith('.dfd.json')).map(f => record(join(dataRoot, 'proyectos', f))).filter(r => !deletedIds.includes(r.project.id)).sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
      const active = existsSync(join(local, 'activo.json')) ? readJSON(join(local, 'activo.json')).id : null;
      return { records, activeProjectId: active, deletedIds, folder: dataRoot, protocol: 2 };
    }
    if (action === 'history' && typeof input.id === 'string' && input.id) {
      const items = revisions(input.id), previous = projectPath(input.id) + '.anterior';
      if (existsSync(previous)) {
        const project = validate(readJSON(previous));
        items.unshift({ id: 'anterior-' + hash(readFileSync(previous)), projectId: input.id, savedAt: statSync(previous).mtime.toISOString(), reason: 'Copia anterior al último guardado', automatic: 0, project });
      }
      return { revisions: items };
    }
    if (action === 'checkpoint') {
      const p = validate(input.project), reason = String(input.reason || 'Punto de recuperación');
      return { revision: checkpoint(p, reason, false, input.deduplicate ? 'importado-' + hash(json(p) + reason) : undefined) };
    }
    if (action === 'delete' && typeof input.id === 'string' && input.id) {
      const path = projectPath(input.id);
      if (existsSync(path)) {
        const current = record(path);
        if (input.expectedEtag !== current.etag) throw new StorageError('El proyecto cambió desde que lo abriste. Reabrí Mis proyectos antes de eliminarlo.', 409, 'conflict');
        atomicWrite(join(dataRoot, 'papelera', hash(input.id) + '-' + randomUUID() + '.dfd.json'), json(current.project));
        atomicWrite(deletedPath(input.id), json({ id: input.id, deletedAt: new Date().toISOString() }));
        unlinkSync(path);
      }
      return { deleted: true };
    }
    if (action !== 'save') throw new StorageError('Operación no permitida.');
    const p = validate(input.project), path = projectPath(p.id), raw = json(p), tag = hash(raw);
    if (existsSync(deletedPath(p.id))) conflict(p, 'Este proyecto fue retirado de la biblioteca.');
    const current = existsSync(path) ? record(path) : null;
    if (current && (current.project.mode ?? 'analysis') !== (p.mode ?? 'analysis')) conflict(p, 'Este identificador pertenece a un proyecto de otro modo. Guardá la copia como proyecto nuevo.');
    if ((!current && input.expectedEtag != null) || (current && tag !== current.etag && input.expectedEtag !== current.etag)) conflict(p, 'Otra ventana cambió este proyecto.');
    if (!current || tag !== current.etag) {
      if (current && !current.recovered) atomicWrite(path + '.anterior', readFileSync(path));
      let automatic = revisions(p.id).filter(r => r.automatic);
      if (!automatic.length || Date.now() - Date.parse(automatic[0].savedAt) >= 120000) {
        checkpoint(current?.project ?? p, 'Autoguardado en disco', true);
        automatic = revisions(p.id).filter(r => r.automatic);
        for (const old of automatic.slice(40)) unlinkSync(join(historyPath(p.id), old.id + '.json'));
      }
      atomicWrite(path, raw);
    }
    mkdirSync(local, { recursive: true });
    atomicWrite(join(local, 'activo.json'), json({ id: p.id }));
    return { etag: tag, savedAt: new Date().toISOString(), folder: dataRoot };
  };
}
