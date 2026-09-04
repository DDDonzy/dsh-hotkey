/** DOM- and Cordis-free ordered Action dispatcher. */

import type { DispatchOutcome, HotkeyActionContext, HotkeyActionDefinition } from '../../contracts/action.ts'
import type { HotkeyBindingRecord } from '../../contracts/binding.ts'

export interface ActionLookup {
  getAction(id: string): HotkeyActionDefinition | undefined
}

/**
 * Dispatch matching bindings in persisted order. Exceptions are contained so a
 * later fallback binding can still run. `defer-native` is terminal.
 */
export function dispatchBindings(
  bindings: readonly HotkeyBindingRecord[],
  registry: ActionLookup,
  context: HotkeyActionContext,
  reportError: (message: string, error: unknown) => void = console.error,
): DispatchOutcome {
  for (const binding of bindings) {
    const action = registry.getAction(binding.event)
    if (action === undefined) continue
    if (action.scope === 'composer' && context.composer === null) continue
    if (action.scope === 'session' && context.sessionId === undefined) continue
    try {
      if (action.when !== undefined && !action.when(context)) continue
      const outcome = action.invoke(context)
      if (outcome === 'handled' || outcome === 'defer-native') return outcome
    } catch (error) {
      reportError(`[dsh-hotkey] Action ${action.id} failed for binding ${binding.id}:`, error)
    }
  }
  return 'continue'
}
