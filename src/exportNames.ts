import { diagramDisplayName, type DiagramBranch } from './hierarchy'
import { safeFilename } from './persistence'

// Keep hierarchy first so truncating a long name retains its level/process.
// Use the document name, independently of a hidden or customized canvas title.
export function diagramExportName(branch: DiagramBranch) {
  const name = diagramDisplayName(branch).replace(/\s+/g, ' ').trim()
  const detail = branch.level === 0 ? 'Contexto' : branch.level === 1 ? 'Sistema completo' : branch.process ? `Espec. proceso ${branch.process.number.trim() || 'sin número'}` : 'Espec.'
  const suffix = name && name.toLocaleLowerCase('es') !== detail.toLocaleLowerCase('es') ? ` - ${name}` : ''
  return safeFilename(`DFD nivel ${branch.level} - ${detail}${suffix}`).replace(/[. ]+$/, '')
}
