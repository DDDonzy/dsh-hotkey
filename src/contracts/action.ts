/** Stable browser Action contract for the dsh-hotkey Cordis service. */

export type DispatchOutcome = 'handled' | 'continue' | 'defer-native'

export type HotkeyActionScope = 'global' | 'composer' | 'session'
export type HotkeyTargetKind = 'composer' | 'editable' | 'page'

/** Context resolved once by keyboard capture before a binding is dispatched. */
export interface HotkeyActionContext {
  readonly keyboardEvent: KeyboardEvent
  readonly target: EventTarget | null
  readonly targetKind: HotkeyTargetKind
  readonly composer: HTMLElement | null
  readonly sessionId?: string
  readonly modalOpen: boolean
  readonly repeated: boolean
}

/** A synchronous Action declaration. Async work may be started by invoke(). */
export interface HotkeyActionDefinition {
  /** Stable, namespaced identifier persisted in a binding. */
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly category: string
  readonly scope: HotkeyActionScope
  readonly when?: (context: HotkeyActionContext) => boolean
  readonly invoke: (context: HotkeyActionContext) => DispatchOutcome
}

export interface HotkeyRegistryV1 {
  readonly apiVersion: 1
  readonly capabilities: ReadonlySet<string>
  registerAction(definition: HotkeyActionDefinition): () => void
  getAction(id: string): HotkeyActionDefinition | undefined
  getSnapshot(): readonly HotkeyActionDefinition[]
  subscribe(listener: () => void): () => void
}
