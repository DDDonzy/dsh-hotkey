/** Shared dsh-hotkey settings and default event/hotkey bindings. */

export const HOTKEY_SETTINGS_NAMESPACE = 'dsh-hotkey'
/** Wire schema version emitted by the current deterministic browser migration. */
export const HOTKEY_SETTINGS_SCHEMA_VERSION = 3 as const

/** Legacy v1 values kept only so an existing settings.yaml can be migrated. */
export const ENTER_KEY_ACTIONS = ['queue', 'steer', 'newline'] as const
export type EnterKeyAction = typeof ENTER_KEY_ACTIONS[number]
export const TAB_KEY_ACTIONS = ['indent', 'tab', 'none'] as const
export type TabKeyAction = typeof TAB_KEY_ACTIONS[number]

/** Stable event ids. Third-party client plugins may register additional ids. */
export const HOTKEY_EVENT_IDS = {
  dshMenuPrevious: 'dsh.composer.menu.previous',
  dshMenuNext: 'dsh.composer.menu.next',
  dshMenuAccept: 'dsh.composer.menu.accept',
  dshMenuDrill: 'dsh.composer.menu.drill',
  dshMenuDismiss: 'dsh.composer.menu.dismiss',
  dshCompleteWithSpace: 'dsh.composer.complete-with-space',
  dshSubmitPrimary: 'dsh.composer.submit.primary',
  dshSubmitAlternate: 'dsh.composer.submit.alternate',
  dshSubmitQueue: 'dsh.composer.submit.queue',
  dshSubmitSteer: 'dsh.composer.submit.steer',
  dshInsertNewline: 'dsh.composer.insert-newline',
  dshCancelSession: 'dsh.session.cancel',
  dshStartSession: 'dsh.session.start-new',
  dshToggleSidebar: 'dsh.layout.toggle-sidebar',
  dshOpenDetails: 'dsh.layout.open-details',
  dshCloseDetails: 'dsh.layout.close-details',
  dshReconnect: 'dsh.connection.reconnect',
  dshFocusComposer: 'dsh.composer.focus',
  historyPrevious: 'dsh-hotkey.history.previous',
  historyNext: 'dsh-hotkey.history.next',
  cursorPageUp: 'dsh-hotkey.cursor.page-up',
  cursorPageDown: 'dsh-hotkey.cursor.page-down',
  insertIndent: 'dsh-hotkey.editor.insert-indent',
  insertTab: 'dsh-hotkey.editor.insert-tab',
} as const

export type BundledHotkeyEventId = typeof HOTKEY_EVENT_IDS[keyof typeof HOTKEY_EVENT_IDS]

/** One ordered event + hotkey combination. Same-hotkey rows form a fallback chain. */
export interface HotkeyBinding {
  readonly id: string
  readonly event: string
  readonly hotkey: string
  readonly enabled: boolean
}

export const HOTKEY_BUILTIN_PRESET_IDS = ['dsh', 'plugin'] as const
export type HotkeyBuiltinPresetId = typeof HOTKEY_BUILTIN_PRESET_IDS[number]
export const HOTKEY_CUSTOM_PRESET_PREFIX = 'custom:' as const
export type HotkeyCustomPresetRef = `${typeof HOTKEY_CUSTOM_PRESET_PREFIX}${string}`
export type HotkeyPresetId = HotkeyBuiltinPresetId | HotkeyCustomPresetRef

export interface HotkeyUserPreset {
  readonly id: string
  readonly name: string
  readonly bindings: readonly HotkeyBinding[]
}

export interface HotkeySettings {
  /** Version of the normalized settings wire format. */
  readonly schemaVersion: typeof HOTKEY_SETTINGS_SCHEMA_VERSION
  /** `dsh` disables this plugin's dispatcher so DSH owns keyboard handling. */
  readonly activePreset: HotkeyPresetId
  readonly bindings: readonly HotkeyBinding[]
  /** User-saved and imported presets; no empty fixed slots are created. */
  readonly presets: readonly HotkeyUserPreset[]
}

export function customPresetRef(id: string): HotkeyCustomPresetRef {
  return `${HOTKEY_CUSTOM_PRESET_PREFIX}${id}`
}

export function customPresetId(ref: HotkeyPresetId): string | undefined {
  return ref.startsWith(HOTKEY_CUSTOM_PRESET_PREFIX)
    ? ref.slice(HOTKEY_CUSTOM_PRESET_PREFIX.length)
    : undefined
}

interface LegacyHotkeySettings {
  escStop?: boolean
  enterBehavior?: EnterKeyAction
  ctrlEnterBehavior?: EnterKeyAction
  shiftEnterBehavior?: EnterKeyAction
  numpadEnterBehavior?: EnterKeyAction
  pageUpDownMoveCursor?: boolean
  arrowHistory?: boolean
  tabBehavior?: TabKeyAction
}

const LEGACY_DEFAULTS: Required<LegacyHotkeySettings> = {
  escStop: true,
  enterBehavior: 'newline',
  ctrlEnterBehavior: 'steer',
  shiftEnterBehavior: 'queue',
  numpadEnterBehavior: 'steer',
  pageUpDownMoveCursor: true,
  arrowHistory: true,
  tabBehavior: 'indent',
}

function createBinding(id: string, event: string, hotkey: string): HotkeyBinding {
  return { id, event, hotkey, enabled: true }
}

function actionEvent(action: EnterKeyAction): BundledHotkeyEventId {
  if (action === 'queue') return HOTKEY_EVENT_IDS.dshSubmitQueue
  if (action === 'steer') return HOTKEY_EVENT_IDS.dshSubmitSteer
  return HOTKEY_EVENT_IDS.dshInsertNewline
}

interface DefaultBindingOptions {
  readonly escStop: boolean
  readonly enterEvent: string
  readonly acceleratedEnterEvent: string
  readonly shiftEnterEvent: string
  readonly numpadEnterEvent: string
  readonly pageCursor: boolean
  readonly arrowHistory: boolean
  readonly tabEvent?: string
}

/**
 * Build the ordered default chain. DSH's contextual menu handlers intentionally
 * precede submission/editor extension events on the same chord.
 */
function buildDefaultBindings(options: DefaultBindingOptions): HotkeyBinding[] {
  const rows: HotkeyBinding[] = []
  const add = (id: string, event: string, hotkey: string): void => {
    rows.push(createBinding(id, event, hotkey))
  }

  add('dsh-menu-dismiss-escape', HOTKEY_EVENT_IDS.dshMenuDismiss, 'Escape')
  if (options.escStop) add('dsh-cancel-escape', HOTKEY_EVENT_IDS.dshCancelSession, 'Escape')

  add('dsh-menu-previous-arrow-up', HOTKEY_EVENT_IDS.dshMenuPrevious, 'ArrowUp')
  if (options.arrowHistory) add('plugin-history-previous-arrow-up', HOTKEY_EVENT_IDS.historyPrevious, 'ArrowUp')
  add('dsh-menu-next-arrow-down', HOTKEY_EVENT_IDS.dshMenuNext, 'ArrowDown')
  if (options.arrowHistory) add('plugin-history-next-arrow-down', HOTKEY_EVENT_IDS.historyNext, 'ArrowDown')

  add('dsh-menu-drill-tab', HOTKEY_EVENT_IDS.dshMenuDrill, 'Tab')
  if (options.tabEvent !== undefined) add('plugin-editor-tab', options.tabEvent, 'Tab')
  add('dsh-complete-space', HOTKEY_EVENT_IDS.dshCompleteWithSpace, 'Space')

  const addDshEnterFamily = (
    suffix: 'enter' | 'numpad-enter',
    key: 'Enter' | 'NumpadEnter',
    primaryEvent: string,
  ): void => {
    const menuChords = [key, `Alt+${key}`, `Mod+${key}`, `Mod+Alt+${key}`] as const
    for (const [index, hotkey] of menuChords.entries()) {
      add(`dsh-menu-accept-${suffix}-${index + 1}`, HOTKEY_EVENT_IDS.dshMenuAccept, hotkey)
    }
    add(`dsh-${suffix}-primary`, primaryEvent, key)
    add(`dsh-${suffix}-primary-alt`, primaryEvent, `Alt+${key}`)
    add(`dsh-${suffix}-alternate`, options.acceleratedEnterEvent, `Mod+${key}`)
    add(`dsh-${suffix}-alternate-alt`, options.acceleratedEnterEvent, `Mod+Alt+${key}`)
    // Native DSH checks Shift before every other modifier, so this one compact
    // rule covers Shift, Ctrl+Shift, Cmd+Alt+Shift, and their Numpad variants.
    add(`dsh-${suffix}-newline-shift`, options.shiftEnterEvent, `Shift+Any+${key}`)
  }

  addDshEnterFamily('enter', 'Enter', options.enterEvent)
  addDshEnterFamily('numpad-enter', 'NumpadEnter', options.numpadEnterEvent)

  if (options.pageCursor) {
    add('plugin-cursor-page-up', HOTKEY_EVENT_IDS.cursorPageUp, 'PageUp')
    add('plugin-cursor-page-up-select', HOTKEY_EVENT_IDS.cursorPageUp, 'Shift+PageUp')
    add('plugin-cursor-page-down', HOTKEY_EVENT_IDS.cursorPageDown, 'PageDown')
    add('plugin-cursor-page-down-select', HOTKEY_EVENT_IDS.cursorPageDown, 'Shift+PageDown')
  }
  return rows
}

/** DSH's unmodified composer keymap represented as bindable events. */
export const DSH_DEFAULT_HOTKEY_BINDINGS: readonly HotkeyBinding[] = buildDefaultBindings({
  escStop: false,
  enterEvent: HOTKEY_EVENT_IDS.dshSubmitPrimary,
  acceleratedEnterEvent: HOTKEY_EVENT_IDS.dshSubmitAlternate,
  shiftEnterEvent: HOTKEY_EVENT_IDS.dshInsertNewline,
  numpadEnterEvent: HOTKEY_EVENT_IDS.dshSubmitPrimary,
  pageCursor: false,
  arrowHistory: false,
})

/**
 * Plugin Preset baseline, captured from the user's User Preset 3. It is kept
 * as the stable built-in plugin recommendation instead of reading user files.
 */
export const PLUGIN_PRESET3_BINDINGS: readonly HotkeyBinding[] = [
  ['dsh-menu-dismiss-escape', HOTKEY_EVENT_IDS.dshMenuDismiss, 'Escape'],
  ['dsh-menu-previous-arrow-up', HOTKEY_EVENT_IDS.dshMenuPrevious, 'ArrowUp'],
  ['dsh-menu-next-arrow-down', HOTKEY_EVENT_IDS.dshMenuNext, 'ArrowDown'],
  ['dsh-menu-drill-tab', HOTKEY_EVENT_IDS.dshMenuDrill, 'Tab'],
  ['dsh-complete-space', HOTKEY_EVENT_IDS.dshCompleteWithSpace, 'Space'],
  ['dsh-menu-accept-enter-1', HOTKEY_EVENT_IDS.dshMenuAccept, 'Enter'],
  ['dsh-menu-accept-enter-2', HOTKEY_EVENT_IDS.dshMenuAccept, 'Alt+Enter'],
  ['dsh-menu-accept-enter-3', HOTKEY_EVENT_IDS.dshMenuAccept, 'Mod+Enter'],
  ['dsh-menu-accept-enter-4', HOTKEY_EVENT_IDS.dshMenuAccept, 'Mod+Alt+Enter'],
  ['dsh-enter-primary', HOTKEY_EVENT_IDS.dshSubmitPrimary, 'Mod+Enter'],
  ['dsh-enter-newline-shift', HOTKEY_EVENT_IDS.dshInsertNewline, 'Enter'],
  ['dsh-menu-accept-numpad-enter-1', HOTKEY_EVENT_IDS.dshMenuAccept, 'NumpadEnter'],
  ['dsh-menu-accept-numpad-enter-2', HOTKEY_EVENT_IDS.dshMenuAccept, 'Alt+NumpadEnter'],
  ['dsh-menu-accept-numpad-enter-3', HOTKEY_EVENT_IDS.dshMenuAccept, 'Mod+NumpadEnter'],
  ['dsh-menu-accept-numpad-enter-4', HOTKEY_EVENT_IDS.dshMenuAccept, 'Mod+Alt+NumpadEnter'],
  ['dsh-numpad-enter-primary', HOTKEY_EVENT_IDS.dshSubmitPrimary, 'NumpadEnter'],
  ['dsh-numpad-enter-alternate', HOTKEY_EVENT_IDS.dshSubmitAlternate, 'Mod+NumpadEnter'],
  ['dsh-hotkey-history-previous-1', HOTKEY_EVENT_IDS.historyPrevious, 'ArrowUp'],
  ['dsh-hotkey-history-next-1', HOTKEY_EVENT_IDS.historyNext, 'ArrowDown'],
  ['dsh-hotkey-cursor-page-up-1', HOTKEY_EVENT_IDS.cursorPageUp, 'PageUp'],
  ['dsh-hotkey-cursor-page-down-1', HOTKEY_EVENT_IDS.cursorPageDown, 'PageDown'],
  ['dsh-hotkey-editor-insert-tab-1', HOTKEY_EVENT_IDS.insertTab, 'Tab'],
].map(([id, event, hotkey]) => createBinding(id, event, hotkey))

export const DEFAULT_HOTKEY_BINDINGS: readonly HotkeyBinding[] = PLUGIN_PRESET3_BINDINGS

export const DEFAULT_HOTKEY_SETTINGS: HotkeySettings = {
  schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
  activePreset: 'plugin',
  bindings: DEFAULT_HOTKEY_BINDINGS,
  presets: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function legacyAction(value: unknown, fallback: EnterKeyAction): EnterKeyAction {
  return value === 'queue' || value === 'steer' || value === 'newline' ? value : fallback
}

function legacyTabEvent(value: unknown): string | undefined {
  if (value === 'none') return undefined
  if (value === 'tab') return HOTKEY_EVENT_IDS.insertTab
  return HOTKEY_EVENT_IDS.insertIndent
}

function hasLegacyFields(value: Record<string, unknown>): boolean {
  return [
    'escStop',
    'enterBehavior',
    'ctrlEnterBehavior',
    'shiftEnterBehavior',
    'numpadEnterBehavior',
    'pageUpDownMoveCursor',
    'arrowHistory',
    'tabBehavior',
  ].some(key => Object.hasOwn(value, key))
}

function buildLegacyBindings(options: DefaultBindingOptions): HotkeyBinding[] {
  const rows: HotkeyBinding[] = []
  const add = (id: string, event: string, hotkey: string): void => {
    rows.push(createBinding(id, event, hotkey))
  }

  // v1 matched Escape and Page keys without filtering modifiers. `Any` is a
  // compact compatibility marker: explicitly named modifiers are required,
  // while any additional modifiers are accepted.
  add('dsh-menu-dismiss-escape', HOTKEY_EVENT_IDS.dshMenuDismiss, 'Escape')
  if (options.escStop) add('legacy-cancel-any-escape', HOTKEY_EVENT_IDS.dshCancelSession, 'Any+Escape')

  add('dsh-menu-previous-arrow-up', HOTKEY_EVENT_IDS.dshMenuPrevious, 'ArrowUp')
  if (options.arrowHistory) add('plugin-history-previous-arrow-up', HOTKEY_EVENT_IDS.historyPrevious, 'ArrowUp')
  add('dsh-menu-next-arrow-down', HOTKEY_EVENT_IDS.dshMenuNext, 'ArrowDown')
  if (options.arrowHistory) add('plugin-history-next-arrow-down', HOTKEY_EVENT_IDS.historyNext, 'ArrowDown')

  add('dsh-menu-drill-tab', HOTKEY_EVENT_IDS.dshMenuDrill, 'Tab')
  if (options.tabEvent !== undefined) {
    add('legacy-editor-tab', options.tabEvent, 'Tab')
    add('legacy-editor-shift-tab', options.tabEvent, 'Shift+Tab')
  }
  add('dsh-complete-space', HOTKEY_EVENT_IDS.dshCompleteWithSpace, 'Space')

  // The old handler yielded to DSH's candidate menu before resolving Enter.
  // DSH only offers menu acceptance when Shift is not held.
  for (const [suffix, hotkey] of [
    ['enter', 'Enter'],
    ['alt-enter', 'Alt+Enter'],
    ['mod-enter', 'Mod+Enter'],
    ['mod-alt-enter', 'Mod+Alt+Enter'],
    ['numpad-enter', 'NumpadEnter'],
    ['alt-numpad-enter', 'Alt+NumpadEnter'],
    ['mod-numpad-enter', 'Mod+NumpadEnter'],
    ['mod-alt-numpad-enter', 'Mod+Alt+NumpadEnter'],
  ] as const) add(`legacy-menu-accept-${suffix}`, HOTKEY_EVENT_IDS.dshMenuAccept, hotkey)

  // v1 priority: Numpad > Ctrl/Meta > Shift > plain. These compact rules
  // cover every modifier combination without expanding the UI to dozens of rows.
  add('legacy-numpad-enter-action', options.numpadEnterEvent, 'Any+NumpadEnter')
  add('legacy-mod-enter-action', options.acceleratedEnterEvent, 'Mod+Any+Enter')
  add('legacy-shift-enter-action', options.shiftEnterEvent, 'Shift+Enter')
  add('legacy-alt-shift-enter-action', options.shiftEnterEvent, 'Alt+Shift+Enter')
  add('legacy-plain-enter-action', options.enterEvent, 'Enter')
  add('legacy-alt-enter-action', options.enterEvent, 'Alt+Enter')

  if (options.pageCursor) {
    add('legacy-cursor-page-up', HOTKEY_EVENT_IDS.cursorPageUp, 'Any+PageUp')
    add('legacy-cursor-page-down', HOTKEY_EVENT_IDS.cursorPageDown, 'Any+PageDown')
  }
  return rows
}

/** Convert the v1 hard-coded fields into a behavior-equivalent v2 keymap. */
export function migrateLegacyHotkeySettings(raw: Record<string, unknown>): HotkeySettings {
  const escStop = typeof raw.escStop === 'boolean' ? raw.escStop : LEGACY_DEFAULTS.escStop
  const pageCursor = typeof raw.pageUpDownMoveCursor === 'boolean'
    ? raw.pageUpDownMoveCursor
    : LEGACY_DEFAULTS.pageUpDownMoveCursor
  const arrowHistory = typeof raw.arrowHistory === 'boolean'
    ? raw.arrowHistory
    : LEGACY_DEFAULTS.arrowHistory
  return {
    schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
    activePreset: 'plugin',
    presets: [],
    bindings: buildLegacyBindings({
      escStop,
      enterEvent: actionEvent(legacyAction(raw.enterBehavior, LEGACY_DEFAULTS.enterBehavior)),
      acceleratedEnterEvent: actionEvent(legacyAction(
        raw.ctrlEnterBehavior,
        LEGACY_DEFAULTS.ctrlEnterBehavior,
      )),
      shiftEnterEvent: actionEvent(legacyAction(
        raw.shiftEnterBehavior,
        LEGACY_DEFAULTS.shiftEnterBehavior,
      )),
      numpadEnterEvent: actionEvent(legacyAction(
        raw.numpadEnterBehavior,
        LEGACY_DEFAULTS.numpadEnterBehavior,
      )),
      pageCursor,
      arrowHistory,
      tabEvent: legacyTabEvent(raw.tabBehavior),
    }),
  }
}

function normalizeBindings(rows: readonly unknown[]): HotkeyBinding[] {
  const ids = new Set<string>()
  const result: HotkeyBinding[] = []
  for (const [index, row] of rows.entries()) {
    if (!isRecord(row)) continue
    const event = typeof row.event === 'string' ? row.event.trim() : ''
    const hotkey = typeof row.hotkey === 'string' ? row.hotkey.trim() : ''
    if (event === '') continue
    const baseId = typeof row.id === 'string' && row.id.trim() !== ''
      ? row.id.trim()
      : `binding-${index + 1}`
    let id = baseId
    let suffix = 2
    while (ids.has(id)) id = `${baseId}-${suffix++}`
    ids.add(id)
    result.push({
      id,
      event,
      hotkey,
      enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
    })
  }
  return result
}

function normalizeUserPresets(raw: unknown): HotkeyUserPreset[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set<string>()
  const presets: HotkeyUserPreset[] = []
  for (const [index, value] of raw.entries()) {
    if (!isRecord(value)) continue
    const baseId = typeof value.id === 'string' && value.id.trim() !== ''
      ? value.id.trim()
      : `preset-${index + 1}`
    let id = baseId
    let suffix = 2
    while (ids.has(id)) id = `${baseId}-${suffix++}`
    ids.add(id)
    const name = typeof value.name === 'string' && value.name.trim() !== ''
      ? value.name.trim()
      : `Preset ${presets.length + 1}`
    presets.push({
      id,
      name,
      bindings: Array.isArray(value.bindings) ? normalizeBindings(value.bindings) : [],
    })
  }
  return presets
}

/** Convert retired fixed file slots into visible user-created presets. */
function normalizeLegacyPresetFiles(raw: unknown): HotkeyUserPreset[] {
  if (!isRecord(raw)) return []
  const result: HotkeyUserPreset[] = []
  for (const [slot, name] of [
    ['file-a', 'Preset File A'],
    ['file-b', 'Preset File B'],
    ['file-c', 'Preset File C'],
  ] as const) {
    const value = raw[slot]
    if (!Array.isArray(value)) continue
    const bindings = normalizeBindings(value)
    if (bindings.length === 0) continue
    result.push({ id: `legacy-${slot}`, name, bindings })
  }
  return result
}

function resolveActivePreset(value: unknown, presets: readonly HotkeyUserPreset[]): HotkeyPresetId {
  if (value === 'dsh' || value === 'plugin') return value
  if (typeof value !== 'string') return 'plugin'
  const legacyId = value === 'file-a' || value === 'file-b' || value === 'file-c'
    ? `legacy-${value}`
    : undefined
  const requested = legacyId ?? customPresetId(value as HotkeyPresetId) ?? value
  const found = presets.find(preset => preset.id === requested)
  return found === undefined ? 'plugin' : customPresetRef(found.id)
}

/** Validate a Host/memory snapshot, preserving unknown third-party event ids. */
export function normalizeHotkeySettings(raw: unknown): HotkeySettings {
  if (!isRecord(raw)) return cloneHotkeySettings(DEFAULT_HOTKEY_SETTINGS)
  const legacy = hasLegacyFields(raw) ? migrateLegacyHotkeySettings(raw) : undefined
  const bindings = Array.isArray(raw.bindings)
    ? normalizeBindings(raw.bindings)
    : legacy?.bindings ?? normalizeBindings(DEFAULT_HOTKEY_BINDINGS)
  const directPresets = normalizeUserPresets(raw.presets)
  const legacyPresets = normalizeLegacyPresetFiles(raw.presetFiles)
  const presets = [...directPresets]
  for (const preset of legacyPresets) {
    if (!presets.some(existing => existing.id === preset.id)) presets.push(preset)
  }
  return {
    schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
    activePreset: resolveActivePreset(raw.activePreset, presets),
    bindings,
    presets,
  }
}

export function cloneHotkeySettings(settings: HotkeySettings): HotkeySettings {
  return {
    schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
    activePreset: settings.activePreset,
    bindings: settings.bindings.map(binding => ({ ...binding })),
    presets: settings.presets.map(preset => ({
      id: preset.id,
      name: preset.name,
      bindings: preset.bindings.map(binding => ({ ...binding })),
    })),
  }
}

export type SettingsListener = (settings: HotkeySettings) => void
