import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { buildRoot, packageInfo, root, run } from './local/common.mjs';

const nodeRelease = 'node-v24.22.3-win-x64';
const nodeChecksum = 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f';
const modules = join(root, 'node_modules');
const runtimeDependencies = ['@modelcontextprotocol/server', 'zod'];
const tar = join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe');

function dependencyTree(names) {
  const dependencies = new Map();
  function visit(name, from) {
    const request = createRequire(join(from, 'package.json'));
    const parent = request.resolve.paths(name)?.find(folder => existsSync(join(folder, name, 'package.json')));
    if (!parent) throw new Error(`Falta la dependencia ${name}. Instalá las dependencias fijadas antes de empaquetar.`);
    const directory = join(parent, name);
    if (dependencies.has(directory)) return;
    const info = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    dependencies.set(directory, info);
    for (const child of Object.keys(info.dependencies || {})) visit(child, directory);
  }
  for (const name of names) visit(name, root);
  return dependencies;
}

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, dereference: true });
}

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Ejecutá el empaquetado en Windows x64.');
const input = process.argv[2] && resolve(process.cwd(), process.argv[2]);
if (!input || !existsSync(input)) throw new Error(`Indicá la ruta al archivo oficial ${nodeRelease}.zip.`);
if (createHash('sha256').update(readFileSync(input)).digest('hex') !== nodeChecksum) throw new Error('El SHA-256 del ZIP de Node.js no coincide con el de la distribución oficial.');
if (!existsSync(join(root, 'dist/index.html')) || !existsSync(join(buildRoot, 'model.mjs'))) throw new Error('Ejecutá pnpm build antes de empaquetar.');

const name = `Trazo-${packageInfo().version}-windows-x64`;
const staging = mkdtempSync(join(buildRoot, 'package-'));
try {
  const output = join(staging, name);
  for (const path of ['Abrir Trazo.cmd', 'README.md', 'package.json', 'dist', 'docs', 'licencias', 'mcp', 'scripts/local', 'scripts/trazo.mjs', '.build/model.mjs', '.build/pert-logic.mjs']) {
    copy(join(root, path), join(output, path));
  }
  if (existsSync(join(root, 'LICENSE'))) copy(join(root, 'LICENSE'), join(output, 'LICENSE'));

  const runtimeFiles = ['node.exe', 'LICENSE'].map(file => `${nodeRelease}/${file}`);
  run(tar, ['-xf', input, '-C', staging, ...runtimeFiles]);
  for (const file of runtimeFiles) copy(join(staging, file), join(output, 'runtime', basename(file)));

  for (const directory of dependencyTree(runtimeDependencies).keys()) {
    const path = relative(modules, directory);
    if (path.startsWith('..' + sep)) throw new Error('Hay una dependencia fuera del directorio de instalación.');
    copy(directory, join(output, 'node_modules', path));
  }
  for (const [directory, info] of dependencyTree(Object.keys(packageInfo().dependencies))) {
    const label = `${info.name.replaceAll('/', '-')}-${info.version}`;
    const notices = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice|copyright)([.-]|$)/i.test(entry.name));
    if (!notices.length && !existsSync(join(root, 'licencias', label, 'LICENSE.txt'))) throw new Error(`Falta el aviso de licencia de ${info.name}@${info.version}.`);
    for (const entry of notices) copy(join(directory, entry.name), join(output, 'licencias', label, entry.name));
  }

  const releases = join(buildRoot, 'releases');
  mkdirSync(releases, { recursive: true });
  const archive = join(releases, name + '.zip');
  run(tar, ['-a', '-cf', archive, '-C', staging, name]);
  console.log(archive);
} finally {
  if (dirname(staging) === buildRoot && basename(staging).startsWith('package-')) rmSync(staging, { recursive: true, force: true });
}
