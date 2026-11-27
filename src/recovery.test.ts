import { describe, expect, it, vi } from 'vitest'
import { clone, createDemoProject } from './model'
import { checkProject, defaultChecks, searchElements } from './projectTools'
import { writeProjectToHandle, type FileHandle } from './persistence'

describe('búsqueda y revisión opcional', () => {
  it('busca por nombre, acentos y número en todos los diagramas', () => {
    const p = createDemoProject(), child = clone(p.diagrams[0]); child.id = 'child'; child.name = 'Otro nivel'; child.nodes[3].text = 'Validar recepción'; child.nodes[3].number = '1.2'; p.diagrams.push(child)
    expect(searchElements(p, '1.2 recepcion')).toEqual([expect.objectContaining({ diagramId: 'child', id: child.nodes[3].id })])
    expect(searchElements(p, '   ')).toEqual([])
    expect(searchElements(p, 'Cliente').length).toBeGreaterThan(1)
  })
  it('avisa sobre datos vacíos y aislamiento sin modificar el documento ni imponer reglas opcionales', () => {
    const p = createDemoProject(), d = p.diagrams[0], process = d.nodes.find(n => n.kind === 'process')!
    d.edges = d.edges.filter(e => e.source.nodeId !== process.id && e.target.nodeId !== process.id); d.edges[0].label.text = ' '; d.nodes[1].text = ''
    const before = clone(p), issues = checkProject(p, defaultChecks)
    expect(issues.some(i => i.id === process.id && i.detail.includes('sin conexiones'))).toBe(true)
    expect(issues.some(i => i.detail.includes('Etiqueta vacía'))).toBe(true)
    expect(issues.some(i => i.detail.includes('sin entradas'))).toBe(false)
    expect(checkProject(p, { ...defaultChecks, processIO: true }).some(i => i.detail.includes('sin entradas ni salidas'))).toBe(true)
    expect(p).toEqual(before)
  })
})

describe('escritura real a archivo: confirmación y fallos', () => {
  const fakeHandle = () => {
    const stream = { write: vi.fn(async (_data: string) => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) }
    const handle: FileHandle = { name: 'proyecto.dfd.json', getFile: vi.fn(), createWritable: vi.fn(async () => stream), queryPermission: vi.fn(async () => 'granted'), requestPermission: vi.fn(async () => 'granted') }
    return { handle, stream }
  }
  it('confirma el guardado únicamente después de cerrar el archivo y serializa el proyecto completo', async () => {
    const p = createDemoProject(), { handle, stream } = fakeHandle()
    await writeProjectToHandle(p, handle)
    expect(JSON.parse(stream.write.mock.calls[0][0])).toEqual(p)
    expect(stream.close).toHaveBeenCalledOnce(); expect(stream.abort).not.toHaveBeenCalled()
    expect(handle.requestPermission).not.toHaveBeenCalled()
  })
  it('solicita permiso de escritura revocado y no escribe si se rechaza', async () => {
    const { handle } = fakeHandle(); handle.queryPermission = vi.fn(async () => 'prompt'); handle.requestPermission = vi.fn(async () => 'denied')
    await expect(writeProjectToHandle(createDemoProject(), handle)).rejects.toThrow('permiso')
    expect(handle.createWritable).not.toHaveBeenCalled()
  })
  it('propaga fallos al escribir o cerrar y aborta el temporal', async () => {
    for (const stage of ['write', 'close'] as const) {
      const { handle, stream } = fakeHandle(); stream[stage].mockRejectedValueOnce(new Error('Disco lleno'))
      await expect(writeProjectToHandle(createDemoProject(), handle)).rejects.toThrow('Disco lleno')
      expect(stream.abort).toHaveBeenCalledOnce()
    }
  })
})
