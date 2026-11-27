import { useState } from 'react'
import { Modal } from './Dialogs'
import type { EditorStore } from './store'
import { projectMode } from './model'

export default function NewContextDialog({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const [name, setName] = useState('')
  const design = projectMode(store.getSnapshot().project) === 'design'
  return <Modal title={design ? 'Nuevo diagrama de nivel 1' : 'Nuevo contexto'} subtitle={design ? 'Procesos, pantallas y tablas.' : 'Entidades externas y un sistema sin número.'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; store.addDiagram(name); store.setTool('select'); onClose() }}>
    <label className="field"><span className="field-label">{design ? 'Nombre del diagrama' : 'Nombre del sistema'}</span><input aria-label={design ? 'Nombre del diagrama' : 'Nombre del contexto'} placeholder="Por ejemplo, Gestión de reparaciones" autoFocus value={name} onChange={e => setName(e.target.value)} /></label>
    <footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={!name.trim()}>{design ? 'Crear diagrama' : 'Crear contexto'}</button></footer>
  </form></Modal>
}
