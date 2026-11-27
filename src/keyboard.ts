// Editing controls own their keys. Ordinary buttons/links do not own drawing
// shortcuts, even when a previous click left browser focus on them.
export function isEditingTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return !!target.closest('input,textarea,select,[role=textbox]') || target instanceof HTMLElement && target.isContentEditable
}

export function focusShortcutSurface(focusCanvas: () => void, dialogOpen = false) {
  const active = document.activeElement
  // Preserve typed values/carets. Toggles, sliders and selects can leave focus
  // just like buttons, so the next drawing shortcut is not captured by them.
  const field = active?.closest('input,textarea,[role=textbox]')
  const actionInput = field instanceof HTMLInputElement && ['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes(field.type)
  if (field && !actionInput || active instanceof HTMLElement && active.isContentEditable) return
  const dialog = document.querySelector<HTMLElement>('.modal-backdrop:not([inert]) > [role=dialog]')
  if (dialog) dialog.focus({ preventScroll: true })
  else if (!dialogOpen) focusCanvas()
}
