import assert from 'node:assert/strict'
import test from 'node:test'
import { compileBindingIndex, bindingsForChord } from '../src/client/core/binding-index.ts'
import { dispatchBindings } from '../src/client/core/binding-dispatcher.ts'
import { HotkeyEventRegistry } from '../src/client/events.ts'

const context = {
  keyboardEvent: {} as KeyboardEvent,
  target: null,
  targetKind: 'page' as const,
  composer: null,
  modalOpen: false,
  repeated: false,
}

test('compiled binding index preserves order and ignores disabled or invalid bindings', () => {
  const index = compileBindingIndex([
    { id: 'first', event: 'sample.first', hotkey: 'f8', enabled: true },
    { id: 'disabled', event: 'sample.disabled', hotkey: 'F8', enabled: false },
    { id: 'second', event: 'sample.second', hotkey: 'F8', enabled: true },
    { id: 'bad', event: 'sample.bad', hotkey: 'not+a+chord', enabled: true },
  ])
  assert.deepEqual(bindingsForChord(index, 'F8').map(binding => binding.id), ['first', 'second'])
})

test('dispatcher distinguishes continue, handled, and defer-native outcomes', () => {
  const registry = new HotkeyEventRegistry()
  const calls: string[] = []
  registry.registerAction({
    id: 'sample.continue', label: 'Continue', category: 'sample', scope: 'global',
    invoke: () => { calls.push('continue'); return 'continue' },
  })
  registry.registerAction({
    id: 'sample.defer', label: 'Defer', category: 'sample', scope: 'global',
    invoke: () => { calls.push('defer'); return 'defer-native' },
  })
  registry.registerAction({
    id: 'sample.late', label: 'Late', category: 'sample', scope: 'global',
    invoke: () => { calls.push('late'); return 'handled' },
  })
  const bindings = [
    { id: 'one', event: 'sample.continue', hotkey: 'F8', enabled: true },
    { id: 'two', event: 'sample.defer', hotkey: 'F8', enabled: true },
    { id: 'three', event: 'sample.late', hotkey: 'F8', enabled: true },
  ]
  assert.equal(dispatchBindings(bindings, registry, context), 'defer-native')
  assert.deepEqual(calls, ['continue', 'defer'])
})

test('dispatcher contains Action failures and proceeds to an ordered fallback', () => {
  const registry = new HotkeyEventRegistry()
  registry.registerAction({
    id: 'sample.throw', label: 'Throw', category: 'sample', scope: 'global',
    invoke: () => { throw new Error('expected') },
  })
  registry.registerAction({
    id: 'sample.handle', label: 'Handle', category: 'sample', scope: 'global', invoke: () => 'handled',
  })
  const reports: string[] = []
  assert.equal(dispatchBindings([
    { id: 'throw', event: 'sample.throw', hotkey: 'F8', enabled: true },
    { id: 'handle', event: 'sample.handle', hotkey: 'F8', enabled: true },
  ], registry, context, message => reports.push(message)), 'handled')
  assert.equal(reports.length, 1)
})
