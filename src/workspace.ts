import { useCallback, useEffect, useRef, useState } from 'react'

export type PanelId = 'header' | 'diagrams' | 'tools' | 'properties' | 'info'
export type PanelVisibility = Record<PanelId, boolean>
export const inspectorSectionIds = ['heading', 'content', 'label-format', 'label-box', 'canvas', 'stats', 'dimensions', 'route', 'alignment', 'appearance', 'text', 'label-position', 'style', 'savedStyles', 'levels']
const settingsKey = 'trazo-dfd:workspace:v1'
type SelectionContext = { projectId: string; diagramId: string; selectionType: string | null }

function loadPreferences() {
  const panels: PanelVisibility = { header: true, diagrams: true, tools: true, properties: true, info: true }
  const closedSections: Record<string, boolean> = {}
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? 'null')
    if (saved && typeof saved === 'object') {
      const data = saved as { panels?: Record<string, unknown>; closedSections?: Record<string, unknown> }
      for (const key of Object.keys(panels) as PanelId[]) if (typeof data.panels?.[key] === 'boolean') panels[key] = data.panels[key]
      for (const key of [...inspectorSectionIds, 'diagrams']) if (typeof data.closedSections?.[key] === 'boolean') closedSections[key] = data.closedSections[key]
    }
  } catch { /* Workspace preferences are optional; project saving uses IndexedDB. */ }
  return { panels, closedSections }
}

export function useWorkspace({ projectId, diagramId, selectionType }: SelectionContext) {
  const [initial] = useState(loadPreferences)
  const [panels, setPanels] = useState(initial.panels)
  const [closedSections, setClosedSections] = useState(initial.closedSections)
  const [focusMode, setFocusMode] = useState(false)
  const previousPanels = useRef<PanelVisibility | null>(null)
  const sectionNavigation = useRef<(SelectionContext & { changes: number }) | null>(null)

  useEffect(() => {
    try { localStorage.setItem(settingsKey, JSON.stringify({ panels: focusMode ? previousPanels.current ?? panels : panels, closedSections })) } catch { /* A preference failure must not prevent editing. */ }
  }, [panels, closedSections, focusMode])

  const togglePanel = (id: PanelId) => setPanels(current => ({ ...current, [id]: !current[id] }))
  const toggleFocus = useCallback(() => {
    if (focusMode) {
      setPanels(previousPanels.current ?? initial.panels)
      previousPanels.current = null
      setFocusMode(false)
    } else {
      previousPanels.current = { ...panels }
      setPanels({ header: false, diagrams: false, tools: false, properties: false, info: false })
      setFocusMode(true)
    }
  }, [focusMode, panels, initial.panels])
  const setSectionOpen = (id: string, open: boolean) => setClosedSections(current => ({ ...current, [id]: !open }))
  const setAllInspectorSections = useCallback((open: boolean) => setClosedSections(current => ({ ...current, ...Object.fromEntries(inspectorSectionIds.map(id => [id, !open])) })), [])
  useEffect(() => {
    const previous = sectionNavigation.current
    if (!previous || previous.projectId !== projectId || previous.diagramId !== diagramId) {
      sectionNavigation.current = { projectId, diagramId, selectionType, changes: 0 }
      return
    }
    // El fondo no cuenta; pasar a otra figura del mismo tipo tampoco.
    if (!selectionType || selectionType === previous.selectionType) return
    if (previous.selectionType) previous.changes++
    previous.selectionType = selectionType
    if (previous.changes >= 3) {
      previous.changes = 0
      setAllInspectorSections(false)
    }
  }, [projectId, diagramId, selectionType, setAllInspectorSections])
  return { panels, focusMode, togglePanel, toggleFocus, closedSections, setSectionOpen, setAllInspectorSections }
}
