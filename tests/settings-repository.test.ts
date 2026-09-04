import assert from 'node:assert/strict'
import test from 'node:test'
import { HotkeySettingsStore } from '../src/client/store.ts'
import { HOTKEY_EVENT_IDS, HOTKEY_SETTINGS_SCHEMA_VERSION, type HotkeySettings } from '../src/settings.ts'

test('settings repository persists a multi-field preset transition atomically', async () => {
  const calls: Array<{ operations: readonly { op: string; path: readonly string[]; value: unknown }[]; revision?: number }> = []
  const value: HotkeySettings = {
    schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
    activePreset: 'plugin',
    bindings: [{ id: 'old', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Enter', enabled: true }],
    presets: [],
  }
  const scope = {
    getSnapshot: () => ({ status: 'ready' as const, value, revision: 17, writable: true, mode: 'host' as const }),
    subscribe: () => () => {},
    set: async () => { throw new Error('legacy set must not be called') },
    mutate: async (operations: readonly { op: 'set'; path: readonly string[]; value: unknown }[], revision?: number) => {
      calls.push({ operations, revision })
    },
  }
  const store = new HotkeySettingsStore()
  store.bind(scope)
  await store.mutate(current => ({
    activePreset: 'custom:release',
    bindings: [{ id: 'new', event: HOTKEY_EVENT_IDS.dshSubmitSteer, hotkey: 'Mod+Enter', enabled: true }],
    presets: [{ id: 'release', name: 'Release', bindings: current.bindings }],
  }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.revision, 17)
  assert.deepEqual(calls[0]?.operations.map(operation => operation.path[0]), ['schemaVersion', 'activePreset', 'bindings', 'presets'])
})

test('settings repository restores durable settings when an atomic write fails', async () => {
  const durable: HotkeySettings = { schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION, activePreset: 'plugin', bindings: [], presets: [] }
  const scope = {
    getSnapshot: () => ({ status: 'ready' as const, value: durable, revision: 3, writable: true, mode: 'host' as const }),
    subscribe: () => () => {},
    set: async () => {},
    mutate: async () => { throw new Error('revision conflict') },
  }
  const store = new HotkeySettingsStore()
  store.bind(scope)
  await assert.rejects(store.mutate(current => ({ ...current, activePreset: 'dsh' })), /revision conflict/u)
  assert.deepEqual(store.getSnapshot(), durable)
  assert.match(store.getStateSnapshot().error ?? '', /revision conflict/u)
})

test('settings repository rejects writes to a read-only or memory scope', async () => {
  for (const mode of ['host', 'memory'] as const) {
    let writes = 0
    const durable: HotkeySettings = { schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION, activePreset: 'plugin', bindings: [], presets: [] }
    const scope = {
      getSnapshot: () => ({ status: 'ready' as const, value: durable, writable: false, mode }),
      subscribe: () => () => {},
      set: async () => { writes += 1 },
      mutate: async () => { writes += 1 },
    }
    const store = new HotkeySettingsStore()
    store.bind(scope)
    await store.mutate(current => ({ ...current, activePreset: 'dsh' }))
    assert.equal(writes, 0)
    assert.equal(store.getSnapshot().activePreset, 'plugin')
    assert.match(store.getStateSnapshot().error ?? '', /read-only/u)
  }
})
