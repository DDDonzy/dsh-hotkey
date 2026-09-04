import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { HotkeyEventRegistry } from '../src/client/events.ts'
import {
  canonicalizeHotkey,
  formatHotkey,
  hotkeyFromKeyboardEvent,
  hotkeyMatches,
  parseHotkey,
} from '../src/client/hotkey.ts'

function keyboard(init: KeyboardEventInit): { event: KeyboardEvent; close(): void } {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  return {
    event: new dom.window.KeyboardEvent('keydown', init),
    close: () => { dom.window.close() },
  }
}

test('hotkey parser canonicalizes portable aliases and physical key codes', () => {
  assert.deepEqual(parseHotkey('cmdorctrl + k'), {
    anyModifier: false, mod: true, ctrl: false, alt: false, shift: false, meta: false, key: 'KeyK',
  })
  assert.equal(canonicalizeHotkey('shift + ctrl + pgdn'), 'Ctrl+Shift+PageDown')
  assert.equal(canonicalizeHotkey('Ctrl+Mod+K'), null)
  assert.equal(canonicalizeHotkey('Ctrl+K+J'), null)
  assert.equal(formatHotkey('Mod+NumpadEnter'), 'Ctrl/Cmd + Num Enter')
})

test('hotkey matching uses exact modifiers and portable Mod semantics', () => {
  const ctrl = keyboard({ key: 'k', code: 'KeyK', ctrlKey: true })
  const meta = keyboard({ key: 'k', code: 'KeyK', metaKey: true })
  const both = keyboard({ key: 'k', code: 'KeyK', ctrlKey: true, metaKey: true })
  const shifted = keyboard({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true })
  assert.equal(hotkeyMatches(ctrl.event, 'Mod+KeyK'), true)
  assert.equal(hotkeyMatches(meta.event, 'Mod+KeyK'), true)
  assert.equal(hotkeyMatches(both.event, 'Mod+KeyK'), true)
  assert.equal(hotkeyMatches(both.event, 'Ctrl+Meta+KeyK'), true)
  assert.equal(hotkeyMatches(shifted.event, 'Mod+KeyK'), false)
  assert.equal(hotkeyMatches(shifted.event, 'Mod+Shift+KeyK'), true)
  assert.equal(hotkeyMatches(shifted.event, 'Mod+Any+KeyK'), true)
  assert.equal(hotkeyMatches(shifted.event, 'Any+KeyK'), true)
  assert.equal(hotkeyFromKeyboardEvent(ctrl.event), 'Mod+KeyK')
  ctrl.close(); meta.close(); both.close(); shifted.close()
})

test('event registry publishes live plugin additions and disposal', () => {
  const registry = new HotkeyEventRegistry()
  let notifications = 0
  const unsubscribe = registry.subscribe(() => { notifications += 1 })
  const release = registry.register({
    id: 'sample-plugin.run',
    label: 'Run sample',
    description: 'Sample event.',
    source: 'sample-plugin',
    scope: 'global',
    execute: () => true,
  })
  assert.equal(registry.get('sample-plugin.run')?.label, 'Run sample')
  assert.equal(registry.getSnapshot().length, 1)
  assert.equal(notifications, 1)
  assert.throws(() => registry.register({
    id: 'sample-plugin.run', label: 'Duplicate', description: '', source: 'sample-plugin', scope: 'global', execute: () => true,
  }), /already registered/u)
  release()
  assert.equal(registry.get('sample-plugin.run'), undefined)
  assert.equal(notifications, 2)
  unsubscribe()
})

test('action registry reserves DSH namespaces and reports registry owners', () => {
  const registry = new HotkeyEventRegistry()
  assert.throws(() => registry.registerAction({
    id: 'dsh.composer.spoof', label: 'Spoof', category: 'third-party', scope: 'global', invoke: () => 'handled',
  }), /requires dsh owner/u)
  registry.registerAction({
    id: 'sample-plugin.run', label: 'Run', category: 'sample-plugin', scope: 'global', invoke: () => 'handled',
  }, 'sample-plugin')
  assert.throws(() => registry.registerAction({
    id: 'sample-plugin.run', label: 'Duplicate', category: 'other-plugin', scope: 'global', invoke: () => 'handled',
  }, 'other-plugin'), /sample-plugin → other-plugin/u)
})
