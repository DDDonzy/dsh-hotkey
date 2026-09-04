import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { HotkeyInterceptor } from '../src/client/interceptor.ts'
import { HotkeyEventRegistry } from '../src/client/events.ts'
import { HotkeySettingsStore, hotkeyStore } from '../src/client/store.ts'
import {
  HOTKEY_EVENT_IDS,
  type HotkeyBinding,
} from '../src/settings.ts'
import type { HistoryDraft } from '../src/client/history.ts'

function installDom(): { composer: HTMLElement; release(): void } {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:3080/', pretendToBeVisual: true,
  })
  const win = dom.window
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries({
    window: win, document: win.document, HTMLElement: win.HTMLElement,
    KeyboardEvent: win.KeyboardEvent, InputEvent: win.InputEvent,
    Event: win.Event, Node: win.Node, Range: win.Range,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const composer = win.document.createElement('div')
  composer.setAttribute('data-composer-input', '')
  composer.setAttribute('role', 'textbox')
  composer.setAttribute('contenteditable', 'true')
  Object.defineProperty(composer, 'isContentEditable', { configurable: true, value: true })
  composer.textContent = 'message'
  win.document.body.appendChild(composer)
  return {
    composer,
    release() {
      dom.window.close()
      for (const [key, descriptor] of previous) {
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, key)
        else Object.defineProperty(globalThis, key, descriptor)
      }
    },
  }
}

function emptyDraft(text: string): HistoryDraft {
  return { text, references: [], images: [], runtimeImageIds: [] }
}

function configure(...bindings: Array<Omit<HotkeyBinding, 'id' | 'enabled'>>): void {
  hotkeyStore.setSetting('bindings', bindings.map((binding, index) => ({
    id: `test-${index}`,
    enabled: true,
    ...binding,
  })))
}

function press(composer: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  composer.dispatchEvent(event)
  return event
}

function selectBoundary(composer: HTMLElement, start: boolean): void {
  const range = document.createRange()
  range.selectNodeContents(composer)
  range.collapse(start)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

test('built-in Actions register and unregister with interceptor lifecycle', () => {
  const registry = new HotkeyEventRegistry()
  const interceptor = new HotkeyInterceptor({}, registry, new HotkeySettingsStore())
  assert.equal(registry.getSnapshot().length, 0)
  const release = interceptor.start()
  assert.ok(registry.getSnapshot().some(action => action.id === HOTKEY_EVENT_IDS.dshSubmitQueue))
  release()
  interceptor.stop()
  assert.equal(registry.getSnapshot().length, 0)
  interceptor.start()
  assert.ok(registry.getSnapshot().some(action => action.id === HOTKEY_EVENT_IDS.dshSubmitQueue))
  interceptor.stop()
})

test('DeepSeek Harness preset bypasses every plugin binding', () => {
  const dom = installDom()
  const store = new HotkeySettingsStore()
  store.setSettings({
    activePreset: 'dsh',
    bindings: [{ id: 'system-bypass', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Enter', enabled: true }],
  })
  const modes: string[] = []
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => ({ submit: mode => modes.push(mode ?? 'queue') }),
  }, new HotkeyEventRegistry(), store)
  interceptor.start()

  const event = press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.deepEqual(modes, [])
  assert.equal(event.defaultPrevented, false)
  interceptor.stop(); dom.release()
})

test('a third-party event can bind to an arbitrary user chord', () => {
  const dom = installDom()
  const registry = new HotkeyEventRegistry()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [{
    id: 'third-party-binding',
    event: 'sample-plugin.toggle-panel',
    hotkey: 'Mod+KeyK',
    enabled: true,
  }])
  let calls = 0
  const interceptor = new HotkeyInterceptor({}, registry, store)
  registry.register({
    id: 'sample-plugin.toggle-panel',
    label: 'Toggle panel',
    description: 'Test extension event.',
    source: 'sample-plugin',
    scope: 'composer',
    execute: () => { calls += 1; return true },
  })
  interceptor.start()

  const event = press(dom.composer, { key: 'k', code: 'KeyK', ctrlKey: true })
  assert.equal(calls, 1)
  assert.equal(event.defaultPrevented, true)
  interceptor.stop(); dom.release()
})

test('same-hotkey events form an ordered fallback chain', () => {
  const dom = installDom()
  const registry = new HotkeyEventRegistry()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [
    { id: 'first', event: 'sample-plugin.first', hotkey: 'F8', enabled: true },
    { id: 'second', event: 'sample-plugin.second', hotkey: 'F8', enabled: true },
  ])
  const calls: string[] = []
  const interceptor = new HotkeyInterceptor({}, registry, store)
  registry.register({
    id: 'sample-plugin.first', label: 'First', description: '', source: 'sample-plugin', scope: 'composer',
    execute: () => { calls.push('first'); return false },
  })
  registry.register({
    id: 'sample-plugin.second', label: 'Second', description: '', source: 'sample-plugin', scope: 'composer',
    execute: () => { calls.push('second'); return true },
  })
  interceptor.start()

  const event = press(dom.composer, { key: 'F8', code: 'F8' })
  assert.deepEqual(calls, ['first', 'second'])
  assert.equal(event.defaultPrevented, true)
  interceptor.stop(); dom.release()
})

test('DSH page actions can be user-bound as global events', () => {
  const dom = installDom()
  const outside = document.createElement('button')
  document.body.appendChild(outside)
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [{
    id: 'toggle-sidebar', event: HOTKEY_EVENT_IDS.dshToggleSidebar, hotkey: 'F9', enabled: true,
  }])
  let calls = 0
  const interceptor = new HotkeyInterceptor({
    onToggleSidebar: () => { calls += 1; return true },
  }, new HotkeyEventRegistry(), store)
  interceptor.start()

  const event = press(outside, { key: 'F9', code: 'F9' })
  assert.equal(calls, 1)
  assert.equal(event.defaultPrevented, true)
  interceptor.stop(); dom.release()
})

test('DSH menu acceptance runs before same-key submission', () => {
  const dom = installDom()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [
    { id: 'menu', event: HOTKEY_EVENT_IDS.dshMenuAccept, hotkey: 'Enter', enabled: true },
    { id: 'send', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Enter', enabled: true },
  ])
  const modes: string[] = []
  let menu: 'consumed' | 'pass' = 'consumed'
  const input = {
    state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) },
    arbitrate: () => menu,
    submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue'),
  }
  const interceptor = new HotkeyInterceptor({ getComposerInput: () => input }, new HotkeyEventRegistry(), store)
  interceptor.start()

  press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.deepEqual(modes, [])
  menu = 'pass'
  press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.deepEqual(modes, ['queue'])
  interceptor.stop(); dom.release()
})

test('private DSH keyboard capability gaps fail open to the native keymap', () => {
  const dom = installDom()
  const menu = document.createElement('div')
  menu.setAttribute('role', 'listbox')
  document.body.appendChild(menu)
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [
    { id: 'menu', event: HOTKEY_EVENT_IDS.dshMenuAccept, hotkey: 'Enter', enabled: true },
    { id: 'submit', event: HOTKEY_EVENT_IDS.dshSubmitPrimary, hotkey: 'Enter', enabled: true },
  ])
  let submits = 0
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => ({
      state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) },
      submit: () => { submits += 1 },
    }),
  }, new HotkeyEventRegistry(), store)
  interceptor.start()

  const event = press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.equal(submits, 0)
  assert.equal(event.defaultPrevented, false)
  interceptor.stop(); dom.release()
})

test('missing private steerQueue capability leaves accelerated queue gesture to DSH', () => {
  const dom = installDom()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [{
    id: 'alternate', event: HOTKEY_EVENT_IDS.dshSubmitAlternate, hotkey: 'Mod+Enter', enabled: true,
  }])
  let submits = 0
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => ({
      state: { getSnapshot: () => ({
        draft: '', imageIds: [], phase: 'plain', queue: [{ placement: 'queued' }],
      }) },
      submit: () => { submits += 1 },
    }),
    getSessionState: () => ({ running: true, subagent: null }),
  }, new HotkeyEventRegistry(), store)
  interceptor.start()

  const event = press(dom.composer, { key: 'Enter', code: 'Enter', ctrlKey: true })
  assert.equal(submits, 0)
  assert.equal(event.defaultPrevented, false)
  interceptor.stop(); dom.release()
})

test('DSH primary and alternate submission events preserve busy Enter policy', () => {
  const dom = installDom()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [
    { id: 'primary', event: HOTKEY_EVENT_IDS.dshSubmitPrimary, hotkey: 'Enter', enabled: true },
    { id: 'alternate', event: HOTKEY_EVENT_IDS.dshSubmitAlternate, hotkey: 'Mod+Enter', enabled: true },
  ])
  const modes: string[] = []
  const input = {
    state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain', queue: [] }) },
    submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue'),
  }
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => input,
    getSessionState: () => ({ running: true, subagent: null }),
    getBusyEnterBehavior: () => 'steer',
  }, new HotkeyEventRegistry(), store)
  interceptor.start()

  press(dom.composer, { key: 'Enter', code: 'Enter' })
  press(dom.composer, { key: 'Enter', code: 'Enter', ctrlKey: true })
  assert.deepEqual(modes, ['steer', 'queue'])
  interceptor.stop(); dom.release()
})

test('removing Enter bindings suppresses every native modifier fallback', () => {
  const dom = installDom()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [])
  const interceptor = new HotkeyInterceptor({}, new HotkeyEventRegistry(), store)
  interceptor.start()

  const events = [
    press(dom.composer, { key: 'Enter', code: 'Enter', altKey: true }),
    press(dom.composer, { key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true }),
    press(dom.composer, { key: 'Enter', code: 'NumpadEnter', ctrlKey: true, metaKey: true }),
  ]
  assert.ok(events.every(event => event.defaultPrevented))
  interceptor.stop(); dom.release()
})

test('locked non-editable composer does not submit or consume Enter', () => {
  const dom = installDom()
  Object.defineProperty(dom.composer, 'isContentEditable', { configurable: true, value: false })
  dom.composer.setAttribute('contenteditable', 'false')
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [{
    id: 'send', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Enter', enabled: true,
  }])
  let calls = 0
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => ({ submit: () => { calls += 1 } }),
  }, new HotkeyEventRegistry(), store)
  interceptor.start()

  const event = press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.equal(calls, 0)
  assert.equal(event.defaultPrevented, false)
  interceptor.stop(); dom.release()
})

test('IME composition and Safari post-composition Enter are ignored', async () => {
  const dom = installDom()
  const store = new HotkeySettingsStore()
  store.setSetting('bindings', [{
    id: 'send', event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Enter', enabled: true,
  }])
  const modes: string[] = []
  const input = {
    state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) },
    submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue'),
  }
  const interceptor = new HotkeyInterceptor({ getComposerInput: () => input }, new HotkeyEventRegistry(), store)
  interceptor.start()

  dom.composer.dispatchEvent(new Event('compositionstart', { bubbles: true }))
  press(dom.composer, { key: 'Enter', code: 'Enter' })
  dom.composer.dispatchEvent(new Event('compositionend', { bubbles: true }))
  press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.deepEqual(modes, [])
  await new Promise(resolve => setTimeout(resolve, 15))
  press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.deepEqual(modes, ['queue'])
  interceptor.stop(); dom.release()
})

test('Ctrl+Enter steer calls the DSH input machine directly', () => {
  const dom = installDom()
  const modes: string[] = []
  configure({ event: HOTKEY_EVENT_IDS.dshSubmitSteer, hotkey: 'Mod+Enter' })
  const input = { state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) }, submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue') }
  const interceptor = new HotkeyInterceptor({ getComposerInput: () => input })
  interceptor.start()
  const event = press(dom.composer, { key: 'Enter', code: 'Enter', ctrlKey: true })
  assert.deepEqual(modes, ['steer'])
  assert.equal(event.defaultPrevented, true)
  interceptor.stop(); dom.release()
})

test('Ctrl+Enter queue stays explicitly queued', () => {
  const dom = installDom()
  const modes: string[] = []
  configure({ event: HOTKEY_EVENT_IDS.dshSubmitQueue, hotkey: 'Mod+Enter' })
  const input = { state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) }, submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue') }
  const interceptor = new HotkeyInterceptor({ getComposerInput: () => input })
  interceptor.start()
  press(dom.composer, { key: 'Enter', code: 'Enter', ctrlKey: true })
  assert.deepEqual(modes, ['queue'])
  interceptor.stop(); dom.release()
})

test('NumpadEnter can bind directly to steer', () => {
  const dom = installDom()
  const modes: string[] = []
  configure({ event: HOTKEY_EVENT_IDS.dshSubmitSteer, hotkey: 'NumpadEnter' })
  const input = { state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) }, submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue') }
  const interceptor = new HotkeyInterceptor({ getComposerInput: () => input })
  interceptor.start()
  press(dom.composer, { key: 'Enter', code: 'NumpadEnter' })
  assert.deepEqual(modes, ['steer'])
  interceptor.stop(); dom.release()
})

test('newline routes through Lexical beforeinput and never submits', () => {
  const dom = installDom()
  const modes: string[] = []
  configure({ event: HOTKEY_EVENT_IDS.dshInsertNewline, hotkey: 'Enter' })
  let lineBreaks = 0
  dom.composer.addEventListener('beforeinput', (event) => {
    if ((event as InputEvent).inputType === 'insertLineBreak') { lineBreaks += 1; event.preventDefault() }
  })
  const input = { state: { getSnapshot: () => ({ draft: 'message', imageIds: [], phase: 'plain' }) }, submit: (mode?: 'queue' | 'steer') => modes.push(mode ?? 'queue') }
  const interceptor = new HotkeyInterceptor({ getComposerInput: () => input })
  interceptor.start()
  press(dom.composer, { key: 'Enter', code: 'Enter' })
  assert.equal(lineBreaks, 1)
  assert.deepEqual(modes, [])
  interceptor.stop(); dom.release()
})

test('history restoration rebuilds reference chips and restores draft icons', async () => {
  const dom = installDom()
  const sessionMention = '@[Research](dsh-session:abc)'
  const historyText = `@README.md ${sessionMention}`
  let snapshot = {
    draft: '@src/ current', draftRev: 1, imageIds: [] as unknown[], phase: 'plain',
    occurrences: [{ source: 'reference', ref: '@src/', label: 'src/', appearance: 'folder' as const, clipboardText: '@src/', offset: 0, length: 5 }],
  }
  dom.composer.textContent = snapshot.draft
  const inserted: Array<{ ref: string; appearance?: string; start: number }> = []
  const facade = {
    state: { getSnapshot: () => snapshot },
    setDraft(text: string) { snapshot = { ...snapshot, draft: text, draftRev: snapshot.draftRev + 1, occurrences: [] }; dom.composer.textContent = text },
    insertReference(reference: { ref: string; appearance?: 'session' | 'file' | 'folder'; source: string; label: string; clipboardText: string }, span: { start: number; end: number; draftRev: number }) {
      assert.equal(span.draftRev, snapshot.draftRev)
      inserted.push({ ref: reference.ref, appearance: reference.appearance, start: span.start })
      snapshot = { ...snapshot, draftRev: snapshot.draftRev + 1, occurrences: [...snapshot.occurrences, { ...reference, offset: span.start, length: span.end - span.start }] }
      return true
    },
    submit() {},
  }
  configure(
    { event: HOTKEY_EVENT_IDS.historyPrevious, hotkey: 'ArrowUp' },
    { event: HOTKEY_EVENT_IDS.historyNext, hotkey: 'ArrowDown' },
  )
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => facade,
    getSessionHistory: () => ({ sessionId: 's1', items: [{ text: historyText, references: [
      { start: 0, end: 10, source: 'reference', ref: '@README.md', label: 'README.md', appearance: 'file', clipboardText: '@README.md' },
      { start: 11, end: historyText.length, source: 'reference', ref: sessionMention, label: 'Research', appearance: 'session', clipboardText: sessionMention },
    ], images: [], runtimeImageIds: [] }] }),
  })
  interceptor.start()
  selectBoundary(dom.composer, true)
  press(dom.composer, { key: 'ArrowUp', code: 'ArrowUp' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(snapshot.draft, historyText)
  assert.deepEqual(inserted.slice(0, 2), [
    { ref: sessionMention, appearance: 'session', start: 11 },
    { ref: '@README.md', appearance: 'file', start: 0 },
  ])
  assert.equal(snapshot.occurrences.length, 2)
  selectBoundary(dom.composer, false)
  press(dom.composer, { key: 'ArrowDown', code: 'ArrowDown' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(snapshot.draft, '@src/ current')
  assert.deepEqual(inserted.at(-1), { ref: '@src/', appearance: 'folder', start: 0 })
  assert.equal(snapshot.occurrences.length, 1)
  interceptor.stop(); dom.release()
})

test('history restoration rehydrates durable image attachments', async () => {
  const dom = installDom()
  const image = { attachmentId: 'sha256:photo', mediaType: 'image/png' as const, name: 'photo.png', bytes: 3, width: 1, height: 1 }
  let draft = 'draft'
  let draftRev = 1
  let imageIds: string[] = []
  const added: string[][] = []
  const removed: string[] = []
  const input = {
    state: { getSnapshot: () => ({ draft, draftRev, imageIds, phase: 'plain' }) },
    setDraft(text: string) { draft = text; draftRev += 1 },
    addImages(ids: readonly string[]) { imageIds = [...imageIds, ...ids]; added.push([...ids]); return true },
    removeImage(id: string) { imageIds = imageIds.filter(value => value !== id); removed.push(id) },
    submit() {},
  }
  const interceptor = new HotkeyInterceptor({
    getComposerInput: () => input,
    getSessionHistory: () => ({ sessionId: 's1', items: [{ text: 'photo prompt', references: [], images: [image], runtimeImageIds: [] }] }),
    restoreHistoryImages: async (images, target) => {
      assert.deepEqual(images, [image])
      assert.equal(target, input)
      target.addImages?.(['runtime-photo'])
    },
  })
  configure(
    { event: HOTKEY_EVENT_IDS.historyPrevious, hotkey: 'ArrowUp' },
    { event: HOTKEY_EVENT_IDS.historyNext, hotkey: 'ArrowDown' },
  )
  interceptor.start()
  selectBoundary(dom.composer, true)
  press(dom.composer, { key: 'ArrowUp', code: 'ArrowUp' })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(draft, 'photo prompt')
  assert.deepEqual(imageIds, ['runtime-photo'])
  assert.deepEqual(added, [['runtime-photo']])
  assert.deepEqual(removed, [])
  interceptor.stop(); dom.release()
})
