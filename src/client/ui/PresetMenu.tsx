/** Preset selection and import/export command menu. */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  customPresetId,
  customPresetRef,
  type HotkeyPresetId,
  type HotkeyUserPreset,
} from '../types.ts'
const BUILTIN_PRESET_LABELS = {
  dsh: 'DeepSeek Harness',
  plugin: 'Plugin Preset',
} as const

export function presetLabel(value: HotkeyPresetId, presets: readonly HotkeyUserPreset[]): string {
  if (value === 'dsh' || value === 'plugin') return BUILTIN_PRESET_LABELS[value]
  const id = customPresetId(value)
  return presets.find(preset => preset.id === id)?.name ?? 'Plugin Preset'
}

export function PresetMenu({
  value,
  presets,
  writable,
  onSelect,
  onSave,
  onDelete,
  onImport,
  onExport,
}: {
  readonly value: HotkeyPresetId
  readonly presets: readonly HotkeyUserPreset[]
  readonly writable: boolean
  readonly onSelect: (preset: HotkeyPresetId) => void
  readonly onSave: () => void
  readonly onDelete: () => void
  readonly onImport: (file: File) => Promise<void>
  readonly onExport: () => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const activeCustomId = customPresetId(value)
  const canDelete = activeCustomId !== undefined && presets.some(preset => preset.id === activeCustomId)

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect()
      const menu = menuRef.current
      if (rect === undefined || menu === null) return
      const width = menu.offsetWidth
      const height = menu.offsetHeight
      const margin = 12
      const left = Math.min(
        Math.max(rect.right - width, margin),
        Math.max(margin, window.innerWidth - width - margin),
      )
      const below = rect.bottom + 4
      const above = rect.top - height - 4
      const top = below + height <= window.innerHeight - margin || above < margin
        ? Math.min(below, Math.max(margin, window.innerHeight - height - margin))
        : above
      setPosition({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const choose = (preset: HotkeyPresetId): void => {
    onSelect(preset)
    setOpen(false)
  }

  const action = (callback: () => void): void => {
    callback()
    setOpen(false)
  }

  const importPreset = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file === undefined) return
    setOpen(false)
    void onImport(file)
  }

  const menu = open ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Hotkey 预设"
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        zIndex: 1100,
        display: 'flex',
        width: '228px',
        maxWidth: 'calc(100vw - 24px)',
        flexDirection: 'column',
        padding: '4px',
        border: '1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.16))',
        borderRadius: '8px',
        background: 'var(--dsw-specific-menu, #292a2d)',
        boxShadow: 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.32))',
        color: 'var(--dsw-alias-label-primary, #fff)',
        visibility: position === null ? 'hidden' : 'visible',
      }}
    >
      {(['dsh', 'plugin'] as const).map(preset => (
        <button
          key={preset}
          type="button"
          role="menuitemradio"
          aria-checked={preset === value}
          disabled={!writable}
          className="dsh-hotkey-control dsh-hotkey-menu-item"
          data-selected={preset === value ? 'true' : undefined}
          onClick={() => { choose(preset) }}
          style={presetMenuItemStyle(writable, preset === value)}
        >
          {BUILTIN_PRESET_LABELS[preset]}
        </button>
      ))}
      {presets.map(preset => {
        const ref = customPresetRef(preset.id)
        return (
          <button
            key={preset.id}
            type="button"
            role="menuitemradio"
            aria-checked={ref === value}
            disabled={!writable}
            className="dsh-hotkey-control dsh-hotkey-menu-item"
            data-selected={ref === value ? 'true' : undefined}
            onClick={() => { choose(ref) }}
            style={presetMenuItemStyle(writable, ref === value)}
          >
            {preset.name}
          </button>
        )
      })}
      <span style={{ height: '1px', margin: '4px 2px', background: 'var(--dsw-alias-border-l2, rgba(255,255,255,.1))' }} />
      <button
        type="button"
        role="menuitem"
        disabled={!writable}
        className="dsh-hotkey-control dsh-hotkey-menu-item"
        onClick={() => { action(onSave) }}
        style={presetActionStyle(writable)}
      >
        Save Preset
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!writable || !canDelete}
        className="dsh-hotkey-control dsh-hotkey-menu-item"
        onClick={() => { action(onDelete) }}
        style={presetActionStyle(writable && canDelete)}
      >
        Delete Preset
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!writable}
        className="dsh-hotkey-control dsh-hotkey-menu-item"
        onClick={() => { importRef.current?.click() }}
        style={presetActionStyle(writable)}
      >
        Load Preset
      </button>
      <button
        type="button"
        role="menuitem"
        className="dsh-hotkey-control dsh-hotkey-menu-item"
        onClick={() => { action(onExport) }}
        style={presetActionStyle(true)}
      >
        Export Preset
      </button>
    </div>,
    document.body,
  ) : null

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        tabIndex={-1}
        aria-hidden="true"
        onChange={importPreset}
        style={{ display: 'none' }}
      />
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="dsh-hotkey-control"
        onClick={() => { setOpen(current => !current) }}
        style={{
          display: 'inline-flex',
          minWidth: '188px',
          height: '36px',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          border: 0,
          borderRadius: '18px',
          padding: '0 14px',
          background: 'var(--dsw-alias-bg-module-platform, rgba(255,255,255,.08))',
          color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))',
          font: 'inherit',
          fontSize: '14px',
          lineHeight: '22px',
          cursor: 'pointer',
        }}
      >
        <span>{presetLabel(value, presets)}</span>
        <IconChevronDownOutline14 size={14} aria-hidden="true" />
      </button>
      {menu}
    </span>
  )
}

function presetMenuItemStyle(enabled: boolean, selected: boolean): Record<string, string | number> {
  return {
    minHeight: '40px',
    border: 0,
    borderRadius: '8px',
    padding: '8px 10px',
    background: 'transparent',
    color: selected
      ? 'var(--dsw-alias-state-business-primary, #759aff)'
      : 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))',
    font: 'inherit',
    fontSize: '13px',
    lineHeight: '20px',
    textAlign: 'left',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.45,
  }
}

function presetActionStyle(enabled: boolean): Record<string, string | number> {
  return {
    minHeight: '40px',
    border: 0,
    borderRadius: '8px',
    padding: '8px 10px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,.72))',
    font: 'inherit',
    fontSize: '13px',
    lineHeight: '20px',
    textAlign: 'left',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.45,
  }
}

