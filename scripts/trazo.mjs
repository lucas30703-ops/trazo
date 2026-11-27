import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { acquireLock, assertNode, buildRoot, prepareLibrary, root } from './local/common.mjs';
import { serve } from './local/server.mjs';

let release;
try {
  assertNode();
  if (!existsSync(join(root, 'dist/index.html')) || !existsSync(join(buildRoot, 'model.mjs')) || !existsSync(join(buildRoot, 'pert-logic.mjs'))) {
    throw new Error('Falta la compilación. Ejecutá pnpm build desde el código fuente o descargá el paquete portable.');
  }
  release = acquireLock('servidor local');
  prepareLibrary();
  await serve();
} catch (error) {
  console.error(error.code === 'EADDRINUSE'
    ? 'El puerto local de Trazo ya está ocupado. Cerrá la instancia anterior antes de volver a abrir.'
    : error.message);
  process.exitCode = 1;
} finally {
  release?.();
}
