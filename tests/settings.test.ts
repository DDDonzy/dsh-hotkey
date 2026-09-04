import assert from 'node:assert/strict'
import test from 'node:test'
import z from '@deepseek-ai/schemastery'
import { apply as applyHost } from '../src/index.ts'
import { hotkeyMatches } from '../src/client/hotkey.ts'
import { HotkeySettingsStore } from '../src/client/store.ts'
import {
  DEFAULT_HOTKEY_SETTINGS,
  DSH_DEFAULT_HOTKEY_BINDINGS,
  HOTKEY_EVENT_IDS,
  HOTKEY_SETTINGS_SCHEMA_VERSION,
  normalizeHotkeySettings,
  type HotkeySettings,
} from '../src/settings.ts'

function captureHostSchema(): z<unknown> {
  let namespace = ''
  let schema: z<unknown> | undefined
  applyHost({
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['settings'])
      callback({
        settings: {
          register(name, nextSchema) {
            namespace = name
            schema = nextSchema as unknown as z<unknown>
          },
        },
      })
    },
  })
  assert.equal(namespace, 'dsh-hotkey')
  assert.ok(schema)
  return schema
}

function matchingEvents(settings: HotkeySettings, init: Partial<KeyboardEvent>): string[] {
  const event = {
    key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    ...init,
  } as KeyboardEvent
  return settings.bindings
    .filter(binding => binding.enabled && hotkeyMatches(event, binding.hotkey))
    .map(binding => binding.event)
}

test('host schema resolves the dynamic DSH + plugin default bindings', () => {
  const schema = captureHostSchema()
  assert.deepEqual(normalizeHotkeySettings(schema({})), DEFAULT_HOTKEY_SETTINGS)
  assert.equal(DEFAULT_HOTKEY_SETTINGS.bindings.length, 22)
  assert.ok(DEFAULT_HOTKEY_SETTINGS.bindings.some(binding =>
    binding.hotkey === 'Mod+Enter' && binding.event === HOTKEY_EVENT_IDS.dshSubmitPrimary))
  assert.ok(DEFAULT_HOTKEY_SETTINGS.bindings.some(binding =>
    binding.hotkey === 'Tab' && binding.event === HOTKEY_EVENT_IDS.dshMenuDrill))
  assert.ok(DEFAULT_HOTKEY_SETTINGS.bindings.some(binding =>
    binding.hotkey === 'Tab' && binding.event === HOTKEY_EVENT_IDS.insertTab))
  assert.deepEqual(matchingEvents(DEFAULT_HOTKEY_SETTINGS, {
    key: 'Enter', code: 'Enter', altKey: true,
  }), [HOTKEY_EVENT_IDS.dshMenuAccept])
  assert.deepEqual(matchingEvents(DEFAULT_HOTKEY_SETTINGS, {
    key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true,
  }), [])
  assert.ok(!DSH_DEFAULT_HOTKEY_BINDINGS.some(binding =>
    binding.event === HOTKEY_EVENT_IDS.historyPrevious
    || binding.event === HOTKEY_EVENT_IDS.insertIndent
    || binding.event === HOTKEY_EVENT_IDS.dshCancelSession))
})

test('host schema is wire-safe after Schemastery serialization', () => {
  const schema = captureHostSchema()
  const rehydrated = new z(schema.toJSON())
  assert.deepEqual(rehydrated({ enterBehavior: 'queue' }), { presetFiles: {}, enterBehavior: 'queue' })
  assert.deepEqual(normalizeHotkeySettings(rehydrated({})), DEFAULT_HOTKEY_SETTINGS)
})

test('host schema migrates legacy hard-coded settings without changing behavior', () => {
  const schema = captureHostSchema()
  const migrated = normalizeHotkeySettings(schema({
    escStop: false,
    enterBehavior: 'newline',
    ctrlEnterBehavior: 'steer',
    shiftEnterBehavior: 'queue',
    numpadEnterBehavior: 'steer',
    pageUpDownMoveCursor: false,
    arrowHistory: false,
    tabBehavior: 'tab',
  }))

  assert.deepEqual(matchingEvents(migrated, { key: 'Enter', code: 'Enter' }), [
    HOTKEY_EVENT_IDS.dshMenuAccept,
    HOTKEY_EVENT_IDS.dshInsertNewline,
  ])
  assert.deepEqual(matchingEvents(migrated, {
    key: 'Enter', code: 'Enter', ctrlKey: true,
  }), [
    HOTKEY_EVENT_IDS.dshMenuAccept,
    HOTKEY_EVENT_IDS.dshSubmitSteer,
  ])
  assert.deepEqual(matchingEvents(migrated, {
    key: 'Enter', code: 'Enter', shiftKey: true,
  }), [HOTKEY_EVENT_IDS.dshSubmitQueue])
  assert.deepEqual(matchingEvents(migrated, {
    key: 'Enter', code: 'NumpadEnter',
  }), [
    HOTKEY_EVENT_IDS.dshMenuAccept,
    HOTKEY_EVENT_IDS.dshSubmitSteer,
  ])
  assert.ok(!migrated.bindings.some(binding => binding.event === HOTKEY_EVENT_IDS.dshCancelSession))
  assert.ok(!migrated.bindings.some(binding => binding.event === HOTKEY_EVENT_IDS.historyPrevious))
  assert.ok(!migrated.bindings.some(binding => binding.event === HOTKEY_EVENT_IDS.cursorPageUp))
  assert.ok(migrated.bindings.some(binding => binding.event === HOTKEY_EVENT_IDS.insertTab))
})

test('legacy migration preserves modifier priority and wildcard behavior', () => {
  const migrated = normalizeHotkeySettings({
    escStop: true,
    enterBehavior: 'newline',
    ctrlEnterBehavior: 'steer',
    shiftEnterBehavior: 'queue',
    numpadEnterBehavior: 'steer',
    pageUpDownMoveCursor: true,
    arrowHistory: true,
    tabBehavior: 'tab',
  })

  assert.equal(matchingEvents(migrated, {
    key: 'Enter', code: 'NumpadEnter', shiftKey: true,
  }).at(-1), HOTKEY_EVENT_IDS.dshSubmitSteer, 'Numpad must outrank Shift')
  assert.equal(matchingEvents(migrated, {
    key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true,
  }).at(-1), HOTKEY_EVENT_IDS.dshSubmitSteer, 'Ctrl/Meta must outrank Shift')
  assert.equal(matchingEvents(migrated, {
    key: 'Enter', code: 'Enter', altKey: true,
  }).at(-1), HOTKEY_EVENT_IDS.dshInsertNewline, 'Alt must retain the plain action')
  assert.equal(matchingEvents(migrated, {
    key: 'Tab', code: 'Tab', shiftKey: true,
  }).at(-1), HOTKEY_EVENT_IDS.insertTab)
  assert.equal(matchingEvents(migrated, {
    key: 'PageUp', code: 'PageUp', ctrlKey: true,
  }).at(-1), HOTKEY_EVENT_IDS.cursorPageUp)
  assert.equal(matchingEvents(migrated, {
    key: 'Escape', code: 'Escape', ctrlKey: true,
  }).at(-1), HOTKEY_EVENT_IDS.dshCancelSession)
})

test('an explicitly empty v2 binding list remains empty', () => {
  const schema = captureHostSchema()
  assert.deepEqual(normalizeHotkeySettings(schema({ bindings: [] })), {
    schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
    activePreset: 'plugin',
    bindings: [],
    presets: [],
  })
})

test('browser store adopts Host bindings and persists the complete binding list', async () => {
  const listeners = new Set<() => void>()
  const writes: Array<[string, unknown]> = []
  let value: HotkeySettings = {
    schemaVersion: HOTKEY_SETTINGS_SCHEMA_VERSION,
    activePreset: 'plugin',
    bindings: [{ id: 'custom', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Ctrl+KeyJ', enabled: true }],
    presets: [],
  }
  const scope = {
    getSnapshot: () => ({
      status: 'ready' as const,
      value,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async set(field: string, next: unknown) {
      writes.push([field, next])
    },
  }

  const store = new HotkeySettingsStore()
  const release = store.bind(scope)
  assert.deepEqual(store.getSnapshot(), value)
  assert.equal(store.getStateSnapshot(), store.getStateSnapshot(), 'state snapshot must be stable')

  const next = [{ ...value.bindings[0]!, hotkey: 'Mod+KeyK' }]
  store.setSetting('bindings', next)
  await Promise.resolve()
  assert.deepEqual(writes, [['bindings', next]])
  assert.deepEqual(store.getSnapshot().bindings, next)

  value = { ...value, bindings: [{ ...next[0]!, enabled: false }] }
  for (const listener of listeners) listener()
  assert.deepEqual(store.getSnapshot(), value)

  release()
  assert.equal(listeners.size, 0)
})

test('preset settings only expose saved or imported user presets', () => {
  const saved = [{ id: 'saved', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'F10', enabled: true }]
  const settings = normalizeHotkeySettings({
    activePreset: 'custom:release',
    bindings: [],
    presets: [{ id: 'release', name: 'Release preset', bindings: saved }],
  })
  assert.equal(settings.activePreset, 'custom:release')
  assert.deepEqual(settings.presets, [{ id: 'release', name: 'Release preset', bindings: saved }])
  assert.equal(normalizeHotkeySettings({ activePreset: 'custom:unknown' }).activePreset, 'plugin')
})

test('legacy fixed preset slots migrate only when they have bindings', () => {
  const saved = [{ id: 'saved', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'F10', enabled: true }]
  const settings = normalizeHotkeySettings({
    activePreset: 'file-b',
    bindings: [],
    presetFiles: { 'file-b': saved },
  })
  assert.deepEqual(settings.presets, [{ id: 'legacy-file-b', name: 'Preset File B', bindings: saved }])
  assert.equal(settings.activePreset, 'custom:legacy-file-b')
})

test('stale store disposer cannot detach a newer settings scope', () => {
  const firstListeners = new Set<() => void>()
  const secondListeners = new Set<() => void>()
  const scope = (listeners: Set<() => void>, id: string) => ({
    getSnapshot: () => ({
      status: 'ready' as const,
      value: { bindings: [{ id, event: HOTKEY_EVENT_IDS.insertIndent, hotkey: 'Tab', enabled: true }] },
      writable: true,
      mode: 'host' as const,
    }),
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async set() {},
  })

  const store = new HotkeySettingsStore()
  const releaseFirst = store.bind(scope(firstListeners, 'first'))
  const releaseSecond = store.bind(scope(secondListeners, 'second'))
  releaseFirst()
  assert.equal(secondListeners.size, 1)
  assert.equal(store.getSnapshot().bindings[0]?.id, 'second')
  releaseSecond()
  assert.equal(secondListeners.size, 0)
})
