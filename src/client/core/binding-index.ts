/** Compile persisted bindings once per settings update for constant-time chord lookup. */

import { canonicalizeHotkey } from '../hotkey.ts'
import type { HotkeyBindingRecord } from '../../contracts/binding.ts'

export interface CompiledBindingIndex<T extends HotkeyBindingRecord = HotkeyBindingRecord> {
  readonly byChord: ReadonlyMap<string, readonly T[]>
}

export function compileBindingIndex<T extends HotkeyBindingRecord>(
  bindings: readonly T[],
): CompiledBindingIndex<T> {
  const mutable = new Map<string, T[]>()
  for (const binding of bindings) {
    if (!binding.enabled) continue
    const chord = canonicalizeHotkey(binding.hotkey)
    if (chord === null) continue
    const group = mutable.get(chord)
    if (group === undefined) mutable.set(chord, [binding])
    else group.push(binding)
  }
  const byChord = new Map<string, readonly T[]>()
  for (const [chord, group] of mutable) byChord.set(chord, Object.freeze(group))
  return Object.freeze({ byChord })
}

export function bindingsForChord<T extends HotkeyBindingRecord>(
  index: CompiledBindingIndex<T>,
  chord: string,
): readonly T[] {
  return index.byChord.get(chord) ?? []
}
