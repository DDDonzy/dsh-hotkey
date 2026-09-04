/** Collapsible Event / Hotkey editor for the DSH Settings shell. */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { hotkeyEventRegistry, type HotkeyEventDefinition } from './events.ts'
import { hotkeySettingsRepository } from './store.ts'
import { EventPicker as EventPickerModal } from './ui/EventPicker.tsx'
import { BindingGroup as BindingGroupView } from './ui/BindingGroup.tsx'
import { PresetMenu, presetLabel } from './ui/PresetMenu.tsx'
import { HOTKEY_UI_CSS } from './ui/styles.ts'
import {
  DEFAULT_HOTKEY_SETTINGS,
  DSH_DEFAULT_HOTKEY_BINDINGS,
  customPresetId,
  normalizeHotkeySettings,
  customPresetRef,
  type HotkeyBinding,
  type HotkeyPresetId,
  type HotkeyUserPreset,
} from './types.ts'

type EventGroup = 'dsh' | 'other'

interface BindingRow {
  readonly key: string
  readonly event: string
  readonly group: EventGroup
  readonly binding?: HotkeyBinding
  readonly definition?: HotkeyEventDefinition
  readonly draft?: true
}

interface EventPickerState {
  readonly row: BindingRow
  readonly options: readonly HotkeyEventDefinition[]
}

function createBindingId(bindings: readonly HotkeyBinding[], event: string): string {
  const ids = new Set(bindings.map(binding => binding.id))
  const seed = event.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '') || 'event'
  let index = 1
  let id = `${seed}-${index}`
  while (ids.has(id)) id = `${seed}-${++index}`
  return id
}

function eventGroup(event: string, definition: HotkeyEventDefinition | undefined): EventGroup {
  return definition?.source === 'dsh' || event.startsWith('dsh.') ? 'dsh' : 'other'
}

function fallbackEventName(event: string): string {
  const leaf = event.split('.').at(-1) ?? event
  return leaf.replace(/[-_]+/gu, ' ').replace(/\b\w/gu, letter => letter.toUpperCase())
}

function eventName(event: string, definition: HotkeyEventDefinition | undefined): string {
  const label = definition?.label ?? fallbackEventName(event)
  return label
}

function compactRows(
  bindings: readonly HotkeyBinding[],
  definitions: readonly HotkeyEventDefinition[],
): readonly BindingRow[] {
  const known = new Map(definitions.map(definition => [definition.id, definition]))
  // Empty saved bindings stay out of the list. An empty draft exists only while
  // the user is actively adding an event.
  return bindings
    .filter(binding => binding.hotkey !== '')
    .map(binding => {
      const definition = known.get(binding.event)
      return {
        key: binding.id,
        event: binding.event,
        group: eventGroup(binding.event, definition),
        binding,
        definition,
      }
    })
}

function SavePresetDialog({
  initialName,
  onSave,
  onClose,
}: {
  readonly initialName: string
  readonly onSave: (name: string) => void
  readonly onClose: () => void
}): ReactNode {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const submit = (): void => {
    if (name.trim() === '') return
    onSave(name)
  }

  return createPortal(
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        zIndex: 1200,
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
        background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,.5))',
        inset: 0,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="娣囨繂鐡ㄦ０鍕啎"
        style={{
          boxSizing: 'border-box',
          width: 'min(400px, calc(100vw - 32px))',
          border: '1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.16))',
          borderRadius: '8px',
          padding: '16px',
          background: 'var(--dsw-specific-menu, #292a2d)',
          boxShadow: 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.32))',
          color: 'var(--dsw-alias-label-primary, #fff)',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: '20px' }}>Save Preset</div>
        <input
          ref={inputRef}
          value={name}
          onChange={event => { setName(event.currentTarget.value) }}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            submit()
          }}
          placeholder="Preset name"
          aria-label="Preset name"
          style={{
            boxSizing: 'border-box',
            width: '100%',
            height: '36px',
            marginTop: '12px',
            border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12))',
            borderRadius: '5px',
            padding: '0 10px',
            outline: 0,
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontSize: '13px',
            lineHeight: '20px',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button
            type="button"
            className="dsh-hotkey-control"
            onClick={onClose}
            style={{
              minHeight: '32px',
              border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12))',
              borderRadius: '5px',
              padding: '4px 12px',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={name.trim() === ''}
            className="dsh-hotkey-control"
            onClick={submit}
            style={{
              minHeight: '32px',
              border: 0,
              borderRadius: '5px',
              padding: '4px 12px',
              background: 'var(--dsw-alias-label-primary, #fff)',
              color: 'var(--dsw-alias-bg-layer-3, #292a2d)',
              font: 'inherit',
              fontSize: '13px',
              cursor: name.trim() === '' ? 'default' : 'pointer',
              opacity: name.trim() === '' ? 0.45 : 1,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function HotkeySettingsSection(): ReactNode {
  const storeState = useSyncExternalStore(
    listener => hotkeySettingsRepository.subscribe(() => { listener() }),
    hotkeySettingsRepository.getStateSnapshot,
  )
  const definitions = useSyncExternalStore(
    hotkeyEventRegistry.subscribe,
    hotkeyEventRegistry.getSnapshot,
  )
  const [drafts, setDrafts] = useState<readonly BindingRow[]>([])
  const [picker, setPicker] = useState<EventPickerState | null>(null)
  const rows = useMemo(
    () => [...compactRows(storeState.value.bindings, definitions), ...drafts],
    [definitions, drafts, storeState.value.bindings],
  )
  const writable = storeState.writable || storeState.mode === 'memory'
  // Built-ins are templates. Any first edit transparently forks a User Preset.
  const canEditBindings = writable
  const optionsFor = (group: EventGroup): readonly HotkeyEventDefinition[] => definitions
    .filter(definition => eventGroup(definition.id, definition) === group)
  const dshOptions = useMemo(() => optionsFor('dsh'), [definitions])
  const otherOptions = useMemo(() => optionsFor('other'), [definitions])
  const dshRows = rows.filter(row => row.group === 'dsh')
  const otherRows = rows.filter(row => row.group === 'other')

  const createPresetId = (seed: string): string => {
    const ids = new Set(storeState.value.presets.map(preset => preset.id))
    const base = seed
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'preset'
    let id = base
    let suffix = 2
    while (ids.has(id)) id = `${base}-${suffix++}`
    return id
  }

  const createUserPresetName = (): string => {
    const names = new Set(storeState.value.presets.map(preset => preset.name))
    if (!names.has('User Preset')) return 'User Preset'
    let suffix = 2
    while (names.has(`User Preset ${suffix}`)) suffix += 1
    return `User Preset ${suffix}`
  }

  const mutateBindings = (mutator: (bindings: readonly HotkeyBinding[]) => readonly HotkeyBinding[]): void => {
    const bindings = mutator(storeState.value.bindings).map(binding => ({ ...binding }))
    const activeId = customPresetId(storeState.value.activePreset)
    const active = activeId === undefined
      ? undefined
      : storeState.value.presets.find(preset => preset.id === activeId)
    if (active !== undefined) {
      const presets = storeState.value.presets.map(preset => preset.id === active.id
        ? { ...preset, bindings }
        : preset)
      hotkeySettingsRepository.setSettings({ bindings, presets })
      return
    }

    const name = createUserPresetName()
    const id = createPresetId(name)
    const userPreset: HotkeyUserPreset = { id, name, bindings }
    hotkeySettingsRepository.setSettings({
      activePreset: customPresetRef(id),
      bindings,
      presets: [...storeState.value.presets, userPreset],
    })
  }

  const addRow = (group: EventGroup): void => {
    // Starting an edit from a built-in template immediately creates an owned
    // preset, while the built-in itself remains untouched.
    mutateBindings(bindings => bindings)
    const key = `draft:${group}:${Date.now().toString(36)}:${drafts.length}`
    setDrafts(current => [...current, { key, event: '', group, draft: true }])
  }

  const openPicker = (row: BindingRow): void => {
    const options = row.group === 'dsh' ? dshOptions : otherOptions
    if (options.length === 0) return
    setPicker({ row, options })
  }

  const setEvent = (row: BindingRow, event: string): void => {
    const definition = definitions.find(item => item.id === event)
    if (definition === undefined) return
    if (row.binding !== undefined) {
      mutateBindings(bindings => bindings.map(binding =>
        binding.id === row.binding!.id ? { ...binding, event } : binding))
    } else {
      setDrafts(current => current.map(item =>
        item.key === row.key ? { ...item, event, definition } : item))
    }
    setPicker(null)
  }

  const setHotkey = (row: BindingRow, hotkey: string): void => {
    if (row.binding !== undefined) {
      mutateBindings(bindings => bindings.map(binding =>
        binding.id === row.binding!.id ? { ...binding, hotkey } : binding))
      return
    }
    if (hotkey === '' || row.event === '') return
    mutateBindings(bindings => [
      ...bindings,
      { id: createBindingId(bindings, row.event), event: row.event, hotkey, enabled: true },
    ])
    setDrafts(current => current.filter(item => item.key !== row.key))
  }

  const clearRow = (row: BindingRow): void => {
    if (row.binding !== undefined) {
      mutateBindings(bindings => bindings.filter(binding => binding.id !== row.binding!.id))
    } else {
      setDrafts(current => current.filter(item => item.key !== row.key))
    }
    if (picker?.row.key === row.key) setPicker(null)
  }

  const [saveDialog, setSaveDialog] = useState(false)
  const [saveDialogInitialName, setSaveDialogInitialName] = useState('')

  const applyPreset = (preset: HotkeyPresetId): void => {
    setDrafts([])
    if (preset === 'dsh') {
      hotkeySettingsRepository.setSettings({
        activePreset: preset,
        bindings: DSH_DEFAULT_HOTKEY_BINDINGS.map(binding => ({ ...binding })),
      })
      return
    }
    if (preset === 'plugin') {
      hotkeySettingsRepository.setSettings({
        activePreset: preset,
        bindings: DEFAULT_HOTKEY_SETTINGS.bindings.map(binding => ({ ...binding })),
      })
      return
    }
    const id = customPresetId(preset)
    const saved = storeState.value.presets.find(item => item.id === id)
    if (saved === undefined) return
    hotkeySettingsRepository.setSettings({
      activePreset: preset,
      bindings: saved.bindings.map(binding => ({ ...binding })),
    })
  }

  const saveNamedPreset = (name: string): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const activeId = customPresetId(storeState.value.activePreset)
    const existing = activeId === undefined
      ? undefined
      : storeState.value.presets.find(preset => preset.id === activeId)
    const id = existing?.id ?? createPresetId(trimmed)
    const nextPreset: HotkeyUserPreset = {
      id,
      name: trimmed,
      bindings: storeState.value.bindings.map(binding => ({ ...binding })),
    }
    const presets = existing === undefined
      ? [...storeState.value.presets, nextPreset]
      : storeState.value.presets.map(preset => preset.id === id ? nextPreset : preset)
    hotkeySettingsRepository.setSettings({
      activePreset: customPresetRef(id),
      presets,
    })
    setSaveDialog(false)
  }

  const savePreset = (): void => {
    const activeId = customPresetId(storeState.value.activePreset)
    const active = activeId === undefined
      ? undefined
      : storeState.value.presets.find(item => item.id === activeId)
    setSaveDialogInitialName(active?.name ?? '')
    setSaveDialog(true)
  }

  const deletePreset = (): void => {
    const id = customPresetId(storeState.value.activePreset)
    if (id === undefined || !storeState.value.presets.some(preset => preset.id === id)) return
    hotkeySettingsRepository.setSettings({
      activePreset: 'plugin',
      bindings: DEFAULT_HOTKEY_SETTINGS.bindings.map(binding => ({ ...binding })),
      presets: storeState.value.presets.filter(preset => preset.id !== id),
    })
    setDrafts([])
  }

  const importPreset = async (file: File): Promise<void> => {
    try {
      const payload = JSON.parse(await file.text()) as unknown
      const source = typeof payload === 'object' && payload !== null
        && typeof (payload as { preset?: unknown }).preset === 'object'
        && (payload as { preset?: unknown }).preset !== null
        ? (payload as { preset: Record<string, unknown> }).preset
        : payload as Record<string, unknown>
      const filename = file.name.replace(/\.json$/iu, '')
      const name = typeof source.name === 'string' && source.name.trim() !== ''
        ? source.name.trim()
        : filename || `Preset ${storeState.value.presets.length + 1}`
      const normalized = normalizeHotkeySettings({
        presets: [{
          id: createPresetId(name),
          name,
          bindings: Array.isArray(source.bindings) ? source.bindings : [],
        }],
      }).presets[0]
      if (normalized === undefined) throw new Error('Preset does not contain valid bindings')
      hotkeySettingsRepository.setSettings({
        activePreset: customPresetRef(normalized.id),
        bindings: normalized.bindings.map(binding => ({ ...binding })),
        presets: [...storeState.value.presets, normalized],
      })
    } catch (error) {
      console.error('[dsh-hotkey] Failed to load preset:', error)
    }
  }

  const exportPreset = (): void => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return
    const activeId = customPresetId(storeState.value.activePreset)
    const active = activeId === undefined
      ? undefined
      : storeState.value.presets.find(preset => preset.id === activeId)
    const payload = JSON.stringify({
      schema: 'dsh-hotkey-preset',
      version: 1,
      preset: {
        name: active?.name ?? presetLabel(storeState.value.activePreset, storeState.value.presets),
        bindings: storeState.value.bindings,
      },
    }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `dsh-hotkey-${active?.id ?? storeState.value.activePreset}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const rowForKey = (key: string): BindingRow | undefined =>
    [...dshRows, ...otherRows].find(row => row.key === key)
  const viewRows = (rows: readonly BindingRow[]) => rows.map(row => ({
    key: row.key,
    event: row.event,
    label: eventName(row.event, row.definition),
    hotkey: row.binding?.hotkey ?? '',
    eventSelected: row.event !== '',
  }))

  return (
    <div
      style={{
        padding: '4px',
        color: 'var(--dsw-alias-label-primary, inherit)',
        fontFamily: 'inherit',
      }}
    >
      <style>{HOTKEY_UI_CSS}</style>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '12px',
        }}
      >
        <PresetMenu
          value={storeState.value.activePreset}
          presets={storeState.value.presets}
          writable={writable}
          onSelect={applyPreset}
          onSave={savePreset}
          onDelete={deletePreset}
          onImport={importPreset}
          onExport={exportPreset}
        />
      </div>
      <BindingGroupView
        title="DeepSeek Harness"
        rows={viewRows(dshRows)}
        canAdd={dshOptions.length > 0}
        writable={canEditBindings}
        onAdd={() => { addRow('dsh') }}
        onPickEvent={key => { const row = rowForKey(key); if (row !== undefined) openPicker(row) }}
        onSetHotkey={(key, hotkey) => { const row = rowForKey(key); if (row !== undefined) setHotkey(row, hotkey) }}
        onClear={key => { const row = rowForKey(key); if (row !== undefined) clearRow(row) }}
      />
      <BindingGroupView
        title="DSH-Plugin Hotkey"
        rows={viewRows(otherRows)}
        canAdd={otherOptions.length > 0}
        writable={canEditBindings}
        onAdd={() => { addRow('other') }}
        onPickEvent={key => { const row = rowForKey(key); if (row !== undefined) openPicker(row) }}
        onSetHotkey={(key, hotkey) => { const row = rowForKey(key); if (row !== undefined) setHotkey(row, hotkey) }}
        onClear={key => { const row = rowForKey(key); if (row !== undefined) clearRow(row) }}
      />
      {saveDialog ? (
        <SavePresetDialog
          initialName={saveDialogInitialName}
          onSave={saveNamedPreset}
          onClose={() => { setSaveDialog(false) }}
        />
      ) : null}
      {picker === null ? null : (
        <EventPickerModal
          options={picker.options.map(definition => ({
            id: definition.id,
            label: eventName(definition.id, definition),
          }))}
          onSelect={event => { setEvent(picker.row, event) }}
          onClose={() => { setPicker(null) }}
        />
      )}
    </div>
  )
}
