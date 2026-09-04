/**
 * Legacy DOM fallback boundary. Selectors, synthetic editing and caret logic
 * remain centralized in `client/dom.ts`; callers outside adapters must not add
 * new direct DOM fallback imports.
 */

export {
  findSendButton,
  findStopButton,
  getComposerElement,
  getComposerInputElement,
  getEditorText,
  insertNewlineAtCursor,
  insertTextAtCursor,
  isMenuOrPopupOpen,
  isModalOrPopupOpen,
  isSelectionAtEnd,
  isSelectionAtStart,
  scrollSelectionIntoView,
  setCaretAtBoundary,
  setEditorText,
} from '../dom.ts'
