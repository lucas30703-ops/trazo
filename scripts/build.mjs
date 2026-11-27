import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { root, buildRoot, assertNode, run, atomicWrite } from './local/common.mjs';

assertNode();
run(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], { stdio: 'inherit' });
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
const model = stripTypeScriptTypes(readFileSync(join(root, 'src/model.ts'), 'utf8')).replace("'./pert/logic'", "'./pert-logic.mjs'");
mkdirSync(buildRoot, { recursive: true });
atomicWrite(join(buildRoot, 'pert-logic.mjs'), stripTypeScriptTypes(readFileSync(join(root, 'src/pert/logic.ts'), 'utf8')));
atomicWrite(join(buildRoot, 'model.mjs'), model);
run(process.execPath, ['--check', join(buildRoot, 'pert-logic.mjs')], { stdio: 'inherit' });
run(process.execPath, ['--check', join(buildRoot, 'model.mjs')], { stdio: 'inherit' });
if (!existsSync(join(root, 'dist/index.html'))) throw new Error('Falta la aplicación compilada.');
