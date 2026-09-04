/** Reactive settings store backed by DSH's shared Host settings document. */

import {
  DEFAULT_HOTKEY_SETTINGS,
  cloneHotkeySettings,
  normalizeHotkeySettings,
  type HotkeySettings,
  type SettingsListener,
} from './types.ts'

export interface HotkeySettingsScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value?: HotkeySettings
  revision?: number
  writable: boolean
  mode: 'host' | 'memory'
}

interface SettingsSetOperation {
  readonly op: 'set'
  readonly path: readonly string[]
  readonly value: unknown
}

export interface HotkeySettingsScope {
  getSnapshot(): HotkeySettingsScopeSnapshot
  subscribe(listener: () => void): () => void
  /** DSH rc.1 atomic namespace mutation API; optional for legacy test/memory scopes. */
  mutate?: (operations: readonly SettingsSetOperation[], expectedRevision?: number) => Promise<void>
  set(field: string, value: unknown): Promise<void>
}

export interface HotkeyStoreState extends HotkeySettingsScopeSnapshot {
  readonly value: HotkeySettings
  readonly error?: string
}

/** UI-facing repository boundary; no component needs a raw DSH settings scope. */
export interface HotkeySettingsRepository {
  getSnapshot(): HotkeySettings
  getStateSnapshot(): HotkeyStoreState
  subscribe(listener: SettingsListener): () => void
  setSetting<K extends keyof HotkeySettings>(key: K, value: HotkeySettings[K]): void
  setSettings(partial: Partial<HotkeySettings>): void
  mutate(operation: (current: HotkeySettings) => HotkeySettings, expectedRevision?: number): Promise<void>
}

function sameBindings(left: readonly HotkeySettings['bindings'][number][], right: readonly HotkeySettings['bindings'][number][]): boolean {
  if (left.length !== right.length) return false
  return left.every((binding, index) => {
    const other = right[index]
    return other !== undefined
      && binding.id === other.id
      && binding.event === other.event
      && binding.hotkey === other.hotkey
      && binding.enabled === other.enabled
  })
}

function sameSettings(left: HotkeySettings, right: HotkeySettings): boolean {
  return left.activePreset === right.activePreset
    && sameBindings(left.bindings, right.bindings)
    && left.presets.length === right.presets.length
    && left.presets.every((preset, index) => {
      const other = right.presets[index]
      return other !== undefined
        && preset.id === other.id
        && preset.name === other.name
        && sameBindings(preset.bindings, other.bindings)
    })
}

function sameSettingsField<K extends keyof HotkeySettings>(
  left: HotkeySettings,
  right: HotkeySettings,
  key: K,
): boolean {
  if (key === 'schemaVersion') return left.schemaVersion === right.schemaVersion
  if (key === 'activePreset') return left.activePreset === right.activePreset
  if (key === 'bindings') return sameBindings(left.bindings, right.bindings)
  return left.presets.length === right.presets.length && left.presets.every((preset, index) => {
    const other = right.presets[index]
    return other !== undefined && preset.id === other.id && preset.name === other.name
      && sameBindings(preset.bindings, other.bindings)
  })
}

function sameState(left: HotkeyStoreState, right: HotkeyStoreState): boolean {
  return sameSettings(left.value, right.value)
    && left.status === right.status
    && left.writable === right.writable
    && left.mode === right.mode
    && left.error === right.error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class HotkeySettingsStore implements HotkeySettingsRepository {
  private state: HotkeyStoreState = {
    status: 'loading',
    value: cloneHotkeySettings(DEFAULT_HOTKEY_SETTINGS),
    writable: false,
    mode: 'memory',
  }
  private readonly listeners = new Set<SettingsListener>()
  private scope: HotkeySettingsScope | undefined
  private releaseScope: (() => void) | undefined
  private bindingGeneration = 0

  /** Bind the browser store to DSH's `settingsScope` mirror. */
  bind(scope: HotkeySettingsScope | undefined): () => void {
    this.releaseScope?.()
    const generation = ++this.bindingGeneration
    this.scope = scope
    if (scope === undefined) {
      this.replaceState({
        ...this.state,
        status: 'unavailable',
        writable: false,
        mode: 'memory',
      })
      return () => {}
    }

    const adopt = (): void => {
      if (generation !== this.bindingGeneration) return
      const snapshot = scope.getSnapshot()
      const value = snapshot.status === 'ready' && snapshot.value !== undefined
        ? normalizeHotkeySettings(snapshot.value)
        : this.state.value
      this.replaceState({
        status: snapshot.status,
        value,
        writable: snapshot.writable,
        mode: snapshot.mode,
      })
    }
    adopt()
    const unsubscribe = scope.subscribe(adopt)
    let active = true
    const release = (): void => {
      if (!active) return
      active = false
      unsubscribe()
      if (generation !== this.bindingGeneration) return
      this.scope = undefined
      this.releaseScope = undefined
    }
    this.releaseScope = release
    return release
  }

  getSnapshot = (): HotkeySettings => this.state.value

  /** Stable snapshot for useSyncExternalStore and availability UI. */
  getStateSnapshot = (): HotkeyStoreState => this.state

  setSetting<K extends keyof HotkeySettings>(key: K, value: HotkeySettings[K]): void {
    void this.mutate(current => ({ ...current, [key]: value })).catch(() => {})
  }

  setSettings(partial: Partial<HotkeySettings>): void {
    void this.mutate(current => ({ ...current, ...partial })).catch(() => {})
  }

  /**
   * Atomically apply a domain operation. A modern DSH scope receives all
   * modified root fields in one `mutate()` request and revision fence.
   */
  async mutate(
    operation: (current: HotkeySettings) => HotkeySettings,
    expectedRevision?: number,
  ): Promise<void> {
    const before = this.state.value
    const next = normalizeHotkeySettings(operation(before))
    if (sameSettings(before, next)) return
    const scope = this.scope
    if (scope !== undefined && !scope.getSnapshot().writable) {
      this.replaceState({ ...this.state, error: 'Hotkey settings are read-only.' })
      return
    }
    this.replaceState({ ...this.state, value: next, error: undefined })
    if (scope === undefined) return
    const keys = (['activePreset', 'bindings', 'presets'] as const)
      .filter(key => !sameSettingsField(before, next, key))
    try {
      if (scope.mutate !== undefined) {
        const revision = expectedRevision ?? scope.getSnapshot().revision
        const operations = [
          { op: 'set' as const, path: ['schemaVersion'], value: next.schemaVersion },
          ...keys.map(key => ({ op: 'set' as const, path: [key], value: next[key] })),
        ]
        await scope.mutate(operations, revision)
      } else {
        for (const key of keys) await scope.set(key, next[key])
      }
    } catch (error) {
      console.error('[dsh-hotkey] Failed to persist Host settings:', error)
      // The scope controller performs its own recovery read. Restore the last
      // known durable snapshot immediately when one is available.
      const durable = scope.getSnapshot()
      const recovered = durable.status === 'ready' && durable.value !== undefined
        ? normalizeHotkeySettings(durable.value) : before
      this.replaceState({ ...this.state, value: recovered, error: errorMessage(error) })
      throw error
    }
  }

  reset(): void {
    this.setSettings(cloneHotkeySettings(DEFAULT_HOTKEY_SETTINGS))
  }

  subscribe = (listener: SettingsListener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private replaceState(next: HotkeyStoreState): void {
    if (sameState(this.state, next)) return
    this.state = next
    for (const listener of this.listeners) {
      try {
        listener(this.state.value)
      } catch (error) {
        console.error('[dsh-hotkey] Error in settings listener:', error)
      }
    }
  }
}

/** @deprecated Internal compatibility alias; UI code should use the repository export. */
export const hotkeyStore = new HotkeySettingsStore()
export const hotkeySettingsRepository: HotkeySettingsRepository = hotkeyStore
