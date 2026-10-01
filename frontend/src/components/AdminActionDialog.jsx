import { useEffect, useId, useRef } from 'react'
import '../styles/admin-management.css'

export default function AdminActionDialog({ title, children, confirmLabel, busy, onConfirm, onCancel }) {
  const titleId = useId()
  const dialog = useRef(null)
  const cancel = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    cancel.current?.focus()
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!busy) onCancel()
    }
    if (event.key !== 'Tab') return
    const controls = Array.from(dialog.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') || [])
    if (!controls.length) { event.preventDefault(); dialog.current?.focus(); return }
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
      event.preventDefault(); first.focus()
    }
  }

  return (
    <div className="admin-action-overlay">
      <section ref={dialog} className="admin-action-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex="-1" onKeyDown={handleKeyDown}>
        <h2 id={titleId}>{title}</h2>
        <form onSubmit={(event) => { event.preventDefault(); if (!busy) onConfirm() }} noValidate>
          {children}
          <div className="campaign-management__actions">
            <button type="submit" disabled={busy}>{busy ? 'Saving…' : confirmLabel}</button>
            <button ref={cancel} type="button" className="campaign-management__secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          </div>
          {busy ? <p role="status">Saving your change…</p> : null}
        </form>
      </section>
    </div>
  )
}
