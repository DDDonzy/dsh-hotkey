/** Centered, viewport-safe Action selection dialog. */

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

export interface EventPickerOption {
  readonly id: string
  readonly label: string
}

export function EventPicker({
  options,
  onSelect,
  onClose,
}: {
  readonly options: readonly EventPickerOption[]
  readonly onSelect: (event: string) => void
  readonly onClose: () => void
}): ReactNode {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown) }
  }, [onClose])

  return createPortal(
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }} style={{ position: 'fixed', zIndex: 1200, display: 'grid', placeItems: 'center', padding: '16px', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,.5))', inset: 0 }}>
      <div role="dialog" data-hotkey-event-picker="true" aria-modal="true" aria-label="选择事件" style={{ boxSizing: 'border-box', display: 'flex', width: 'min(480px, calc(100vw - 32px))', maxHeight: 'min(560px, calc(100vh - 32px))', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.16))', borderRadius: '8px', background: 'var(--dsw-specific-menu, #292a2d)', boxShadow: 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.32))', color: 'var(--dsw-alias-label-primary, #fff)', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', minHeight: '48px', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 16px', borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1))' }}>
          <strong style={{ fontSize: '14px', fontWeight: 600, lineHeight: '20px' }}>Select Event</strong>
          <button ref={closeRef} type="button" aria-label="关闭事件选择" className="dsh-hotkey-control" onClick={onClose} style={{ display: 'inline-flex', width: '28px', height: '28px', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '5px', background: 'transparent', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,.48))', cursor: 'pointer' }}>
            <IconCloseOutline16 size={16} aria-hidden="true" />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', padding: '6px' }}>
          {options.map(option => (
            <button key={option.id} type="button" className="dsh-hotkey-control dsh-hotkey-menu-item" onClick={() => { onSelect(option.id) }} style={{ display: 'flex', minHeight: '40px', alignItems: 'center', border: 0, borderRadius: '8px', padding: '8px 10px', background: 'transparent', color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))', font: 'inherit', fontSize: '13px', lineHeight: '20px', textAlign: 'left', cursor: 'pointer' }}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
