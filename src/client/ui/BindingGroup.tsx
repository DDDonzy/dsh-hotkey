/** Collapsible binding group, independent of settings persistence and Action registry. */

import { useState, type ReactNode } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCloseOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { HotkeyRecorder } from './HotkeyRecorder.tsx'

export interface BindingGroupRow {
  readonly key: string
  readonly event: string
  readonly label: string
  readonly hotkey: string
  readonly eventSelected: boolean
}

export function BindingGroup({
  title, rows, canAdd, writable, onAdd, onPickEvent, onSetHotkey, onClear,
}: {
  readonly title: string
  readonly rows: readonly BindingGroupRow[]
  readonly canAdd: boolean
  readonly writable: boolean
  readonly onAdd: () => void
  readonly onPickEvent: (key: string) => void
  readonly onSetHotkey: (key: string, hotkey: string) => void
  readonly onClear: (key: string) => void
}): ReactNode {
  const [open, setOpen] = useState(true)
  const Chevron = open ? IconChevronDownOutline14 : IconChevronRightOutline14
  return <section style={{ marginTop: '18px' }}>
    <button type="button" aria-expanded={open} className="dsh-hotkey-disclosure" onClick={() => { setOpen(value => !value) }} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '8px', border: 0, padding: 0, background: 'transparent', color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))', font: 'inherit', fontSize: '14px', fontWeight: 600, lineHeight: '22px', textAlign: 'left', cursor: 'pointer' }}>
      <span className="dsh-hotkey-control dsh-hotkey-disclosure-icon" aria-hidden="true"><Chevron size={14} /></span>
      <span>{title}</span><span style={{ flex: 1, height: '1px', background: 'var(--dsw-alias-border-l2, rgba(255,255,255,.1))' }} />
    </button>
    {open ? <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 0 2px' }}>
        {rows.map(row => <div key={row.key} className="dsh-hotkey-line" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 28px', gap: '12px', minHeight: '40px', alignItems: 'center' }}>
          <button type="button" disabled={!writable} className="dsh-hotkey-control" onClick={() => { onPickEvent(row.key) }} style={{ boxSizing: 'border-box', width: '100%', minHeight: '30px', overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12))', borderRadius: '5px', padding: '4px 8px', background: 'transparent', color: row.eventSelected ? 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))' : 'var(--dsw-alias-label-tertiary, rgba(255,255,255,.48))', font: 'inherit', fontSize: '12px', lineHeight: '20px', textAlign: 'left', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: writable ? 'pointer' : 'default', opacity: writable ? 1 : .5 }}>{row.eventSelected ? row.label : 'Select Event'}</button>
          <HotkeyRecorder value={row.hotkey} disabled={!writable || !row.eventSelected} onChange={value => { onSetHotkey(row.key, value) }} onClear={() => { onClear(row.key) }} />
          <button type="button" aria-label="Delete binding" title="Delete binding" disabled={!writable} className="dsh-hotkey-control dsh-hotkey-icon" onClick={() => { onClear(row.key) }} style={{ display: 'inline-flex', width: '28px', height: '28px', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: '5px', padding: 0, background: 'transparent', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,.48))', cursor: writable ? 'pointer' : 'default', opacity: writable ? 1 : .35 }}><IconCloseOutline16 size={16} aria-hidden="true" /></button>
        </div>)}
      </div>
      <button type="button" disabled={!writable || !canAdd} className="dsh-hotkey-control dsh-hotkey-add" onClick={onAdd} style={{ width: '100%', minHeight: '32px', marginTop: '6px', border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12))', borderRadius: '5px', background: 'transparent', color: 'var(--dsw-alias-label-tertiary, rgba(255,255,255,.48))', font: 'inherit', fontSize: '12px', lineHeight: '18px', cursor: !writable || !canAdd ? 'default' : 'pointer', opacity: !writable || !canAdd ? .35 : 1 }}>+ Add Event</button>
    </> : null}
  </section>
}
