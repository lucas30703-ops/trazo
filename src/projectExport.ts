import { strToU8, zipSync } from 'fflate'
import type { Project } from './model'
import { diagramBlob, type ExportOptions } from './export'
import { diagramForView, diagramTitle, flattenHierarchy, processTitle, projectHierarchy } from './hierarchy'
import { downloadBlob, safeFilename } from './persistence'
import { diagramExportName } from './exportNames'

export type ProjectExportOptions = ExportOptions & { includeSystem?: boolean }

export function projectExportPlan(project: Project, format: ExportOptions['format'], includeSystem = true) {
  const paths = new Map<string, string>()
  return flattenHierarchy(projectHierarchy(project)).map(({ branch, order }) => {
    const name = branch.level === 1 && branch.parentId ? 'Sistema completo' : branch.process ? processTitle(branch.process) : diagramTitle(branch.diagram)
    const folder = `${String(order.at(-1)).padStart(2, '0')}_Nivel_${branch.level}_${safeFilename(name).slice(0, 52)}`
    const path = (branch.parentId ? paths.get(branch.parentId) + '/' : '') + folder
    paths.set(branch.diagram.id, path)
    return { diagram: diagramForView(branch), level: branch.level, path: `${path}/${diagramExportName(branch)}.${format}` }
  }).filter(item => includeSystem || item.level !== 1)
}
export function projectArchive(project: Project, files: { path: string; data: Uint8Array }[]) {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = Object.create(null)
  entries['proyecto.dfd.json'] = [strToU8(JSON.stringify(project, null, 2)), { level: 6 }]
  entries['indice.txt'] = [strToU8(`${project.name}\n\nDiagramas en orden de jerarquía:\n${files.map((f, i) => `${i + 1}. ${f.path}`).join('\n')}\n\nproyecto.dfd.json conserva todos los diagramas editables.\n`), { level: 6 }]
  for (const f of files) entries[f.path] = [f.data, { level: 0 }]
  return zipSync(entries)
}
export async function exportProject(project: Project, options: ProjectExportOptions, onProgress: (done: number, total: number) => void, signal?: AbortSignal) {
  const { includeSystem = true, ...diagramOptions } = options
  const files: { path: string; data: Uint8Array }[] = [], plan = projectExportPlan(project, options.format, includeSystem)
  if (!plan.length) throw new Error('No quedan diagramas para exportar. Activá Incluir Sistema completo.')
  let size = 0
  for (const [i, item] of plan.entries()) {
    signal?.throwIfAborted()
    const blob = await diagramBlob(item.diagram, { ...diagramOptions, selection: undefined }), data = new Uint8Array(await blob.arrayBuffer())
    size += data.length
    if (size > 256 * 1024 * 1024) throw new Error('El conjunto de imágenes supera 256 MB. Probá una escala menor o SVG para descargar todos.')
    files.push({ path: item.path, data }); onProgress(i + 1, plan.length)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  signal?.throwIfAborted()
  const bytes = projectArchive(project, files)
  signal?.throwIfAborted()
  downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${safeFilename(project.name)}-diagramas.zip`)
}
