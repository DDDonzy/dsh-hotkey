/**
 * Browser Action registry exposed as the `hotkeyRegistry` Cordis service.
 *
 * `HotkeyEvent*` declarations remain as deprecated compatibility aliases for
 * one release. New integrations should use `registerAction()` and `invoke()`.
 */

import type {
  HotkeyActionContext,
  HotkeyActionDefinition,
  HotkeyActionScope,
  HotkeyRegistryV1,
} from '../contracts/action.ts'

export type { DispatchOutcome, HotkeyActionContext, HotkeyActionDefinition, HotkeyActionScope, HotkeyRegistryV1 } from '../contracts/action.ts'

/** @deprecated Use HotkeyActionScope. */
export type HotkeyEventScope = Extract<HotkeyActionScope, 'global' | 'composer'>
/** @deprecated Use HotkeyActionContext. */
export type HotkeyExecutionContext = HotkeyActionContext

/** @deprecated Use HotkeyActionDefinition with `invoke`. */
export interface HotkeyEventDefinition {
  readonly id: string
  readonly label: string
  readonly description: string
  /** Legacy display grouping; new Actions use category. */
  readonly source: string
  readonly scope: HotkeyActionScope
  /** Return true when the browser event should be consumed. */
  readonly execute: (context: HotkeyExecutionContext) => boolean
}

type RegisteredAction = Omit<HotkeyActionDefinition, 'description'> & {
  readonly description: string
  /** Provider identity recorded at registration time for diagnostics. */
  readonly owner: string
  /** @deprecated Legacy display grouping; use category. */
  readonly source: string
  readonly execute: (context: HotkeyExecutionContext) => boolean
}

export interface HotkeyEventRegistryFace extends HotkeyRegistryV1 {
  /** @deprecated Use registerAction. */
  register(definition: HotkeyEventDefinition): () => void
  /** @deprecated Use getAction. */
  get(id: string): RegisteredAction | undefined
  getSnapshot(): readonly RegisteredAction[]
}

function assertAction(definition: HotkeyActionDefinition): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(definition.id)) {
    throw new TypeError(`invalid hotkey action id: ${JSON.stringify(definition.id)}`)
  }
  if (definition.label.trim() === '') throw new TypeError('hotkey action label must not be empty')
  if (definition.category.trim() === '') throw new TypeError('hotkey action category must not be empty')
  if (!['global', 'composer', 'session'].includes(definition.scope)) {
    throw new TypeError(`invalid hotkey action scope: ${String(definition.scope)}`)
  }
  if (typeof definition.invoke !== 'function') throw new TypeError('hotkey action invoke must be a function')
}

function assertNamespace(id: string, owner: string): void {
  if (id.startsWith('dsh.') && owner !== 'dsh') {
    throw new TypeError(`reserved dsh.* action id requires dsh owner: ${id}`)
  }
  if (id.startsWith('dsh-hotkey.') && owner !== 'dsh-hotkey') {
    throw new TypeError(`reserved dsh-hotkey.* action id requires dsh-hotkey owner: ${id}`)
  }
}

function legacyToAction(definition: HotkeyEventDefinition, owner = definition.source): RegisteredAction {
  if (typeof definition.execute !== 'function') throw new TypeError('hotkey event execute must be a function')
  const action: HotkeyActionDefinition = {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    category: definition.source,
    scope: definition.scope,
    invoke: context => definition.execute(context) ? 'handled' : 'continue',
  }
  assertAction(action)
  assertNamespace(action.id, owner)
  return Object.freeze({
    ...action,
    description: definition.description,
    owner,
    source: definition.source,
    execute: definition.execute,
  })
}

function actionToRegistered(definition: HotkeyActionDefinition, owner = definition.category): RegisteredAction {
  assertAction(definition)
  assertNamespace(definition.id, owner)
  const source = definition.category
  return Object.freeze({
    ...definition,
    description: definition.description ?? '',
    owner,
    source,
    execute: (context: HotkeyExecutionContext) => definition.invoke(context) === 'handled',
  })
}

export class HotkeyEventRegistry implements HotkeyEventRegistryFace {
  readonly apiVersion = 1 as const
  readonly capabilities: ReadonlySet<string> = new Set(['actions', 'dispatch-outcome-v1'])
  private readonly definitions = new Map<string, RegisteredAction>()
  private readonly listeners = new Set<() => void>()
  private snapshot: readonly RegisteredAction[] = []

  registerAction = (definition: HotkeyActionDefinition, owner?: string): (() => void) =>
    this.registerStored(actionToRegistered(definition, owner))

  /** @deprecated Use registerAction. */
  register = (definition: HotkeyEventDefinition): (() => void) =>
    this.registerStored(legacyToAction(definition))

  registerAll(definitions: readonly HotkeyEventDefinition[]): () => void {
    const releases: Array<() => void> = []
    try {
      for (const definition of definitions) releases.push(this.register(definition))
    } catch (error) {
      for (const release of releases.reverse()) release()
      throw error
    }
    return () => { for (const release of releases.reverse()) release() }
  }

  getAction = (id: string): HotkeyActionDefinition | undefined => this.definitions.get(id)
  /** @deprecated Use getAction. */
  get = (id: string): RegisteredAction | undefined => this.definitions.get(id)
  getSnapshot = (): readonly RegisteredAction[] => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private registerStored(stored: RegisteredAction): () => void {
    const existing = this.definitions.get(stored.id)
    if (existing !== undefined) {
      throw new Error(`hotkey action already registered: ${stored.id} (${existing.owner} → ${stored.owner})`)
    }
    this.definitions.set(stored.id, stored)
    this.publish()
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.definitions.get(stored.id) !== stored) return
      this.definitions.delete(stored.id)
      this.publish()
    }
  }

  private publish(): void {
    this.snapshot = Object.freeze([...this.definitions.values()])
    for (const listener of this.listeners) {
      try { listener() } catch (error) {
        console.error('[dsh-hotkey] Error in action registry listener:', error)
      }
    }
  }
}

/** Shared registry provided as the browser Cordis `hotkeyRegistry` service. */
export const hotkeyEventRegistry = new HotkeyEventRegistry()
