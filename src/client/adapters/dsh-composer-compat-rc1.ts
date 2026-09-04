/**
 * DSH 0.1.2-rc.1 concrete ComposerKeyboard compatibility bridge.
 *
 * No deep runtime imports are used. These package-private methods are probed
 * structurally; unavailable capabilities always return `defer-native` so the
 * original DSH keymap remains authoritative.
 */

import type { DispatchOutcome } from '../../contracts/action.ts'

interface ComposerKeyboardRc1 {
  arbitrate?: (key: 'up' | 'down' | 'enter' | 'escape' | 'tab', composing: boolean) => 'consumed' | 'pick-highlighted' | 'pass'
  space?: () => boolean
  dismissPopup?: () => void
  steerQueue?: () => void
}

function compat(input: unknown): ComposerKeyboardRc1 {
  return input as ComposerKeyboardRc1
}

/** Runtime health snapshot for diagnostics UI/logging; no private import needed. */
export function getComposerCompatHealth(input: unknown): Readonly<Record<'arbitrate' | 'space' | 'dismissPopup' | 'steerQueue', boolean>> {
  const keyboard = compat(input)
  return Object.freeze({
    arbitrate: keyboard.arbitrate !== undefined,
    space: keyboard.space !== undefined,
    dismissPopup: keyboard.dismissPopup !== undefined,
    steerQueue: keyboard.steerQueue !== undefined,
  })
}

export function arbitrateComposerRc1(
  input: unknown,
  key: 'up' | 'down' | 'enter' | 'tab',
): DispatchOutcome {
  const arbitrate = compat(input).arbitrate
  if (arbitrate === undefined) return 'continue'
  return arbitrate(key, false) === 'pass' ? 'continue' : 'handled'
}

export function dismissComposerPopupRc1(input: unknown): DispatchOutcome {
  const keyboard = compat(input)
  if (keyboard.dismissPopup === undefined && keyboard.arbitrate === undefined) return 'defer-native'
  keyboard.dismissPopup?.()
  const outcome = keyboard.arbitrate?.('escape', false)
  return outcome !== undefined && outcome !== 'pass' ? 'handled' : 'continue'
}

export function confirmComposerSpaceRc1(input: unknown): DispatchOutcome {
  const space = compat(input).space
  return space?.() === true ? 'handled' : 'continue'
}

export function steerQueueRc1(input: unknown): DispatchOutcome {
  const steerQueue = compat(input).steerQueue
  if (steerQueue === undefined) return 'defer-native'
  steerQueue()
  return 'handled'
}

export function hasArbitrateComposerRc1(input: unknown): boolean {
  return compat(input).arbitrate !== undefined
}
