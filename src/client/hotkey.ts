/** Canonical keyboard-chord parsing, capture, matching, and display helpers. */

export interface ParsedHotkey {
  /** Allow additional modifiers beyond the explicitly required ones. */
  readonly anyModifier: boolean
  readonly mod: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  readonly key: string
}

const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift', 'Meta', 'Any'] as const
const MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'Control',
  'Meta',
  'OS',
  'Shift',
])

const KEY_ALIASES: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  numenter: 'NumpadEnter',
  numpadenter: 'NumpadEnter',
  tab: 'Tab',
  space: 'Space',
  spacebar: 'Space',
  ' ': 'Space',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  pgup: 'PageUp',
  pageup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
}

const KEY_DISPLAY: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  NumpadEnter: 'Num Enter',
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

function normalizeModifier(token: string): typeof MODIFIER_ORDER[number] | null {
  switch (token.trim().toLowerCase()) {
    case 'mod':
    case 'primary':
    case 'cmdorctrl':
    case 'ctrlorcmd':
    case 'commandorcontrol': return 'Mod'
    case 'ctrl':
    case 'control': return 'Ctrl'
    case 'alt':
    case 'option': return 'Alt'
    case 'shift': return 'Shift'
    case 'meta':
    case 'cmd':
    case 'command': return 'Meta'
    case 'any':
    case 'anymodifier':
    case '*': return 'Any'
    default: return null
  }
}

function normalizeKeyToken(token: string): string | null {
  const value = token.trim()
  if (value === '') return null
  const alias = KEY_ALIASES[value.toLowerCase()]
  if (alias !== undefined) return alias
  if (/^[a-z]$/iu.test(value)) return `Key${value.toUpperCase()}`
  if (/^[0-9]$/u.test(value)) return `Digit${value}`
  if (/^key[a-z]$/iu.test(value)) return `Key${value.slice(-1).toUpperCase()}`
  if (/^digit[0-9]$/iu.test(value)) return `Digit${value.slice(-1)}`
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/iu.test(value)) return value.toUpperCase()
  if (/^[A-Za-z][A-Za-z0-9]*$/u.test(value)) {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
  }
  return null
}

/** Parse a chord with exactly one non-modifier key. */
export function parseHotkey(value: string): ParsedHotkey | null {
  const tokens = value.split('+').map(token => token.trim()).filter(Boolean)
  if (tokens.length === 0) return null
  const modifiers = new Set<typeof MODIFIER_ORDER[number]>()
  let key: string | null = null
  for (const token of tokens) {
    const modifier = normalizeModifier(token)
    if (modifier !== null) {
      if (modifiers.has(modifier)) return null
      modifiers.add(modifier)
      continue
    }
    if (key !== null) return null
    key = normalizeKeyToken(token)
    if (key === null) return null
  }
  if (key === null) return null
  if (modifiers.has('Mod') && (modifiers.has('Ctrl') || modifiers.has('Meta'))) return null
  return {
    anyModifier: modifiers.has('Any'),
    mod: modifiers.has('Mod'),
    ctrl: modifiers.has('Ctrl'),
    alt: modifiers.has('Alt'),
    shift: modifiers.has('Shift'),
    meta: modifiers.has('Meta'),
    key,
  }
}

export function canonicalizeHotkey(value: string): string | null {
  const parsed = parseHotkey(value)
  if (parsed === null) return null
  const parts: string[] = []
  if (parsed.mod) parts.push('Mod')
  if (parsed.ctrl) parts.push('Ctrl')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push('Meta')
  if (parsed.anyModifier) parts.push('Any')
  parts.push(parsed.key)
  return parts.join('+')
}

function keyTokenFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  const code = event.code
  if (code !== '' && code !== 'Unidentified') {
    if (code === 'Space') return 'Space'
    return normalizeKeyToken(code)
  }
  return normalizeKeyToken(event.key)
}

/** Capture a single Ctrl/Cmd as Mod; preserve a deliberate Ctrl+Cmd chord exactly. */
export function hotkeyFromKeyboardEvent(event: KeyboardEvent): string | null {
  const key = keyTokenFromEvent(event)
  if (key === null) return null
  const parts: string[] = []
  if (event.ctrlKey !== event.metaKey) parts.push('Mod')
  else {
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.metaKey) parts.push('Meta')
  }
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

function matchesKey(event: KeyboardEvent, expected: string): boolean {
  const actual = keyTokenFromEvent(event)
  return actual === expected
}

/** Match required modifiers exactly unless the compatibility `Any` marker allows extras. */
export function hotkeyMatches(event: KeyboardEvent, hotkey: string): boolean {
  const parsed = parseHotkey(hotkey)
  if (parsed === null || !matchesKey(event, parsed.key)) return false

  if (parsed.mod && !event.ctrlKey && !event.metaKey) return false
  if (parsed.ctrl && !event.ctrlKey) return false
  if (parsed.meta && !event.metaKey) return false
  if (parsed.alt && !event.altKey) return false
  if (parsed.shift && !event.shiftKey) return false
  if (parsed.anyModifier) return true

  if (parsed.mod) {
    // Mod accepts Ctrl, Meta, or both just like DSH's accelerated Enter check.
  } else if (event.ctrlKey !== parsed.ctrl || event.metaKey !== parsed.meta) return false
  return event.altKey === parsed.alt && event.shiftKey === parsed.shift
}

export function formatHotkey(value: string): string {
  const parsed = parseHotkey(value)
  if (parsed === null) return value === '' ? '未设置' : `无效：${value}`
  const parts: string[] = []
  if (parsed.mod) parts.push('Ctrl/Cmd')
  if (parsed.ctrl) parts.push('Ctrl')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push('Cmd')
  if (parsed.anyModifier) parts.push('任意附加键')
  const key = parsed.key.startsWith('Key')
    ? parsed.key.slice(3)
    : parsed.key.startsWith('Digit')
      ? parsed.key.slice(5)
      : (KEY_DISPLAY[parsed.key] ?? parsed.key)
  parts.push(key)
  return parts.join(' + ')
}
