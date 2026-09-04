/**
 * DOM manipulation and detection utilities for DSH composer.
 *
 * Selectors below match the real DeepSeek Harness Web client (ui-conversation
 * InputBar / ComposerContentEditable):
 *   - contenteditable host: `[data-composer-input]` with `role="textbox"`.
 *   - composer card that brackets the toolbar: `[data-composer-card]`.
 *   - send/stop primary buttons carry localized `aria-label`:
 *       input.send = "发送消息" / "Send message"
 *       input.stop = "停止生成" / "Stop generating"
 */

/** aria-label values the primary send button takes (zh / en). */
export const SEND_BUTTON_LABELS = ['发送消息', 'Send message'] as const

/** aria-label values the stop button takes (zh / en). */
export const STOP_BUTTON_LABELS = ['停止生成', 'Stop generating'] as const

const SEND_BUTTON_SELECTOR = SEND_BUTTON_LABELS
  .map(label => `button[aria-label="${label}"]`)
  .join(', ')
const STOP_BUTTON_SELECTOR = STOP_BUTTON_LABELS
  .map(label => `button[aria-label="${label}"]`)
  .join(', ')

export function getComposerElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  const composer = target.closest<HTMLElement>('[data-composer-input]')
  if (composer !== null) {
    return composer.isContentEditable && composer.getAttribute('aria-disabled') !== 'true'
      ? composer
      : null
  }
  return target.isContentEditable
    && target.getAttribute('role') === 'textbox'
    && target.getAttribute('aria-disabled') !== 'true'
    ? target
    : null
}

export function isComposerElement(target: EventTarget | null): target is HTMLElement {
  return getComposerElement(target) !== null
}

export function getComposerInputElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return (
    document.querySelector<HTMLElement>('[data-composer-input]') ??
    document.querySelector<HTMLElement>('[data-input-scroll] [contenteditable="true"]') ??
    document.querySelector<HTMLElement>('[role="textbox"][aria-multiline="true"]')
  )
}

/** The composer card that brackets the composer toolbar (`data-composer-card`). */
export function getComposerCardElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>('[data-composer-card]')
}

export function isModalOrPopupOpen(): boolean {
  if (typeof document === 'undefined') return false

  // Check for open modals, dialogs, dropdown menus, autocomplete popups, etc.
  const modal = document.querySelector(
    '[role="dialog"], .mask, [data-modal], .popupSelect, [data-state="open"]'
  )
  if (modal) return true

  const menu = document.querySelector(
    '[role="menu"], [role="listbox"], [data-source-menu], [data-menu]'
  )
  if (menu) return true

  return false
}

export function isMenuOrPopupOpen(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector(
      '[role="menu"], [role="listbox"], [data-source-menu], [data-menu], .popupSelect'
    ) !== null
  )
}

export function findSendButton(scopeEl?: HTMLElement | null): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null

  if (scopeEl) {
    const composerCard = scopeEl.closest<HTMLElement>('[data-composer-card]')
    const localBtn = (composerCard ?? scopeEl).querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR)
    if (localBtn && !localBtn.disabled) return localBtn
  }

  const cardBtn = getComposerCardElement()?.querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR)
  if (cardBtn && !cardBtn.disabled) return cardBtn

  return document.querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR)
}

export function findStopButton(): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null
  const cardBtn = getComposerCardElement()?.querySelector<HTMLButtonElement>(STOP_BUTTON_SELECTOR)
  if (cardBtn && !cardBtn.disabled) return cardBtn
  return document.querySelector<HTMLButtonElement>(
    `${STOP_BUTTON_SELECTOR}, [data-composer-stop]`
  )
}

export function isSelectionAtStart(container: HTMLElement): boolean {
  if (!container.textContent || container.textContent.length === 0) {
    return true
  }

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false

  try {
    const preRange = document.createRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)
    return preRange.toString().length === 0
  } catch {
    return false
  }
}

export function isSelectionAtEnd(container: HTMLElement): boolean {
  if (!container.textContent || container.textContent.length === 0) {
    return true
  }

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false

  try {
    const postRange = document.createRange()
    postRange.selectNodeContents(container)
    postRange.setStart(range.endContainer, range.endOffset)
    return postRange.toString().length === 0
  } catch {
    return false
  }
}

export function getEditorText(container: HTMLElement): string {
  return container.innerText || container.textContent || ''
}

export function setCaretAtBoundary(
  container: HTMLElement,
  boundary: 'start' | 'end',
): void {
  container.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(container)
  range.collapse(boundary === 'start')
  sel.removeAllRanges()
  sel.addRange(range)
  scrollSelectionIntoView(container)
}

export function setEditorText(
  container: HTMLElement,
  text: string,
  cursorPosition: 'start' | 'end' = 'end'
): void {
  container.focus()
  const sel = window.getSelection()
  if (!sel) return

  // Select all content inside container
  const range = document.createRange()
  range.selectNodeContents(container)
  sel.removeAllRanges()
  sel.addRange(range)

  // Use execCommand to preserve undo stack and trigger Lexical editor change listeners
  const success = document.execCommand('insertText', false, text)
  if (!success) {
    container.textContent = text
    container.dispatchEvent(new Event('input', { bubbles: true }))
  }

  setCaretAtBoundary(container, cursorPosition)
}

export function insertTextAtCursor(text: string): void {
  const success = document.execCommand('insertText', false, text)
  if (!success) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

export function insertNewlineAtCursor(container: HTMLElement): boolean {
  container.focus()

  // Route through Lexical's own beforeinput handler. It preventDefaults this
  // event and dispatches INSERT_LINE_BREAK_COMMAND against the resident editor,
  // preserving reference chips and the editor state. Direct DOM mutation or
  // execCommand('insertLineBreak') can be reconciled as an empty document.
  if (typeof InputEvent === 'function') {
    try {
      const event = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertLineBreak',
        data: null,
      })
      container.dispatchEvent(event)
      if (event.defaultPrevented) return true
    } catch {
      // Fall through to the browser's insertText path.
    }
  }

  // Lexical also maps insertText with a single newline to its line-break
  // command. This remains state-aware in browsers that implement execCommand.
  try {
    return document.execCommand('insertText', false, '\n')
  } catch {
    return false
  }
}

export function scrollSelectionIntoView(container: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const scrollParent = container.closest<HTMLElement>('[data-input-scroll]') || container
  const range = sel.getRangeAt(0)
  if (typeof range.getBoundingClientRect !== 'function' || typeof scrollParent.getBoundingClientRect !== 'function') return
  const rect = range.getBoundingClientRect()
  const box = scrollParent.getBoundingClientRect()

  if (rect.bottom > box.bottom) {
    scrollParent.scrollTop += rect.bottom - box.bottom + 4
  } else if (rect.top < box.top) {
    scrollParent.scrollTop -= box.top - rect.top + 4
  }
}
