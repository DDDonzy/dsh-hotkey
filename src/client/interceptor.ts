/** Dynamic event + hotkey dispatcher for the DSH Web UI. */

import { hotkeyStore, type HotkeySettingsStore } from './store.ts'
import {
  historyManager,
  type HistoryDraft,
  type HistoryImage,
  type HistoryReference,
  type SessionHistorySnapshot,
} from './history.ts'
import {
  HOTKEY_EVENT_IDS,
  type HotkeyBinding,
} from './types.ts'
import {
  HotkeyEventRegistry,
  hotkeyEventRegistry,
  type DispatchOutcome,
  type HotkeyActionDefinition,
  type HotkeyExecutionContext,
} from './events.ts'
import { compileBindingIndex, bindingsForChord, type CompiledBindingIndex } from './core/binding-index.ts'
import { dispatchBindings } from './core/binding-dispatcher.ts'
import { hotkeyFromKeyboardEvent } from './hotkey.ts'
import {
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
} from './adapters/dom-fallback.ts'
import {
  arbitrateComposerRc1,
  confirmComposerSpaceRc1,
  dismissComposerPopupRc1,
  hasArbitrateComposerRc1,
  steerQueueRc1,
} from './adapters/dsh-composer-compat-rc1.ts'
import { submitWithPublicInput, type ComposerInputFace, type ComposerSubmitMode } from './adapters/dsh-public-actions.ts'

export type { ComposerInputFace, ComposerSubmitMode } from './adapters/dsh-public-actions.ts'

export interface ActiveSessionState {
  readonly running: boolean
  readonly subagent: unknown | null
}

export interface InterceptorOptions {
  onCancelSession?: () => boolean | Promise<boolean>
  isSessionRunning?: () => boolean
  getSessionState?: () => ActiveSessionState
  getBusyEnterBehavior?: () => ComposerSubmitMode
  getComposerInput?: () => ComposerInputFace | undefined
  getSessionHistory?: () => SessionHistorySnapshot
  /** Current session id fences async history restores after a session switch. */
  getActiveSessionId?: () => string | undefined
  onStartSession?: () => boolean
  onToggleSidebar?: () => boolean
  onOpenDetails?: () => boolean
  onCloseDetails?: () => boolean
  onReconnect?: () => boolean
  restoreHistoryImages?: (
    images: readonly HistoryImage[],
    input: ComposerInputFace,
  ) => Promise<void>
}

export class HotkeyInterceptor {
  private active = false
  private startReferences = 0
  private options: InterceptorOptions = {}
  private historyRestorePending = false
  private historyRestoreGeneration = 0
  private composing = false
  private composingUntil = 0
  readonly events: HotkeyEventRegistry
  private readonly settingsStore: HotkeySettingsStore
  private bindingIndex: CompiledBindingIndex<HotkeyBinding> = compileBindingIndex([])
  private readonly builtinActions: readonly HotkeyActionDefinition[]
  private actionReleases: Array<() => void> = []

  constructor(
    options?: InterceptorOptions,
    registry = new HotkeyEventRegistry(),
    settingsStore: HotkeySettingsStore = hotkeyStore,
  ) {
    this.events = registry
    this.settingsStore = settingsStore
    if (options) this.options = options
    this.builtinActions = this.createEventDefinitions()
    const recompile = (): void => { this.bindingIndex = compileBindingIndex(this.settingsStore.getSnapshot().bindings) }
    recompile()
    this.settingsStore.subscribe(recompile)
  }

  setOptions(options: InterceptorOptions): void {
    this.options = { ...this.options, ...options }
  }

  start(): () => void {
    this.activateActions()
    if (typeof window === 'undefined') return () => {}
    this.startReferences += 1
    if (!this.active) {
      this.active = true
      window.addEventListener('keydown', this.handleKeyDown, true)
      window.addEventListener('compositionstart', this.handleCompositionStart, true)
      window.addEventListener('compositionend', this.handleCompositionEnd, true)
    }
    let released = false
    return () => {
      if (released) return
      released = true
      this.startReferences = Math.max(0, this.startReferences - 1)
      if (this.startReferences === 0) this.teardownListener()
    }
  }

  stop(): void {
    this.startReferences = 0
    this.teardownListener()
    this.deactivateActions()
  }

  /** Register built-in actions only while this contribution fiber is live. */
  private activateActions(): void {
    if (this.actionReleases.length > 0) return
    try {
      this.actionReleases = this.builtinActions.map(action => this.events.registerAction(action))
    } catch (error) {
      for (const release of this.actionReleases.reverse()) release()
      this.actionReleases = []
      throw error
    }
  }

  private deactivateActions(): void {
    for (const release of this.actionReleases.reverse()) release()
    this.actionReleases = []
  }

  private teardownListener(): void {
    if (!this.active || typeof window === 'undefined') return
    this.active = false
    this.historyRestoreGeneration += 1
    this.historyRestorePending = false
    this.composing = false
    this.composingUntil = 0
    window.removeEventListener('keydown', this.handleKeyDown, true)
    window.removeEventListener('compositionstart', this.handleCompositionStart, true)
    window.removeEventListener('compositionend', this.handleCompositionEnd, true)
    historyManager.resetNavigation()
  }

  private handleCompositionStart = (): void => {
    this.composing = true
  }

  private handleCompositionEnd = (): void => {
    this.composing = false
    // Mirrors DSH's Safari guard: compositionend can precede the confirming
    // Enter keydown while KeyboardEvent.isComposing is already false.
    this.composingUntil = Date.now() + 10
  }

  /** Generic ordered dispatcher: bindings contain every key/event combination. */
  private handleKeyDown = (event: KeyboardEvent): void => {
    // DeepSeek Harness preset is a true bypass: no capture dispatch, no
    // fallback suppression, and DSH's own keyboard map receives the event.
    if (this.settingsStore.getSnapshot().activePreset === 'dsh') return
    if (
      event.defaultPrevented
      || event.isComposing
      || event.keyCode === 229
      || this.composing
      || Date.now() < this.composingUntil
    ) return
    if (
      event.target instanceof HTMLElement
      && event.target.closest('[data-hotkey-recorder="true"]') !== null
    ) return
    const chord = hotkeyFromKeyboardEvent(event)
    if (chord === null) return
    const composer = getComposerElement(event.target)
    const target = event.target
    const targetKind = composer !== null
      ? 'composer'
      : target instanceof HTMLElement && target.isContentEditable ? 'editable' : 'page'
    const context: HotkeyExecutionContext = {
      keyboardEvent: event,
      target,
      composer,
      targetKind,
      modalOpen: isModalOrPopupOpen(),
      repeated: event.repeat,
    }
    const outcome = dispatchBindings(bindingsForChord(this.bindingIndex, chord), this.events, context)
    if (outcome === 'handled') {
      this.consume(event)
      return
    }
    if (outcome === 'defer-native') return

    // Every Enter/Numpad modifier combination has native DSH semantics. Once
    // the user removes all matching rows, suppress that native fallback so the
    // chord stays genuinely unbound rather than silently reappearing.
    if (composer !== null && event.key === 'Enter') this.consume(event)
  }

  private consume(event: KeyboardEvent): void {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  private createEventDefinitions(): readonly HotkeyActionDefinition[] {
    const event = (
      id: string,
      label: string,
      description: string,
      source: 'dsh' | 'dsh-hotkey',
      scope: 'global' | 'composer',
      invoke: (context: HotkeyExecutionContext) => boolean | DispatchOutcome,
    ): HotkeyActionDefinition => ({
      id,
      label,
      description,
      category: source,
      scope,
      invoke: context => {
        const outcome = invoke(context)
        return typeof outcome === 'boolean' ? (outcome ? 'handled' : 'continue') : outcome
      },
    })

    return [
      event(HOTKEY_EVENT_IDS.dshMenuPrevious, '候选菜单：上一项', 'DSH 输入候选菜单向上移动。菜单未打开时放行。', 'dsh', 'composer', () => this.arbitrate('up')),
      event(HOTKEY_EVENT_IDS.dshMenuNext, '候选菜单：下一项', 'DSH 输入候选菜单向下移动。菜单未打开时放行。', 'dsh', 'composer', () => this.arbitrate('down')),
      event(HOTKEY_EVENT_IDS.dshMenuAccept, '候选菜单：接受', '接受 DSH 当前高亮的命令或引用候选；无候选时放行给后续事件。', 'dsh', 'composer', () => this.arbitrate('enter')),
      event(HOTKEY_EVENT_IDS.dshMenuDrill, '候选菜单：进入目录', '进入支持下钻的 DSH 文件夹候选；不可下钻时放行。', 'dsh', 'composer', () => this.arbitrate('tab')),
      event(HOTKEY_EVENT_IDS.dshMenuDismiss, '关闭输入候选菜单', '关闭 DSH 命令、引用或弹出候选。', 'dsh', 'composer', () => this.dismissComposerMenu()),
      event(HOTKEY_EVENT_IDS.dshCompleteWithSpace, '空格确认命令', '执行 DSH 行首命令的空格确认；没有命令命中时正常输入空格。', 'dsh', 'composer', () => confirmComposerSpaceRc1(this.options.getComposerInput?.())),
      event(HOTKEY_EVENT_IDS.dshSubmitPrimary, '按 DSH 主行为发送', '空闲时排队；繁忙时遵循 DSH“繁忙时 Enter”设置。', 'dsh', 'composer', context => this.submitByPolicy(context, false)),
      event(HOTKEY_EVENT_IDS.dshSubmitAlternate, '按 DSH 备用行为发送', '空闲时排队；繁忙时使用 DSH 主行为的相反模式，并保留“插话全部队列”手势。', 'dsh', 'composer', context => this.submitByPolicy(context, true)),
      event(HOTKEY_EVENT_IDS.dshSubmitQueue, '排队发送', '通过 DSH 输入机显式以 queue 模式提交。', 'dsh', 'composer', context => this.submitExplicit(context, 'queue')),
      event(HOTKEY_EVENT_IDS.dshSubmitSteer, '插话发送', '通过 DSH 输入机显式以 steer 模式提交。', 'dsh', 'composer', context => this.submitExplicit(context, 'steer')),
      event(HOTKEY_EVENT_IDS.dshInsertNewline, '插入换行', '通过 DSH Lexical 编辑器插入换行。', 'dsh', 'composer', context => this.insertNewline(context)),
      event(HOTKEY_EVENT_IDS.dshCancelSession, '停止当前生成', '没有弹窗时取消当前 DSH 会话运行。', 'dsh', 'global', () => this.cancelSession()),
      event(HOTKEY_EVENT_IDS.dshStartSession, '新建会话', '调用 DSH Workspace 导航服务新建并打开会话。', 'dsh', 'global', () => this.options.onStartSession?.() ?? false),
      event(HOTKEY_EVENT_IDS.dshToggleSidebar, '切换侧边栏', '打开或收起 DSH 会话侧边栏。', 'dsh', 'global', () => this.options.onToggleSidebar?.() ?? false),
      event(HOTKEY_EVENT_IDS.dshOpenDetails, '打开详情面板', '打开 DSH 右侧详情面板。', 'dsh', 'global', () => this.options.onOpenDetails?.() ?? false),
      event(HOTKEY_EVENT_IDS.dshCloseDetails, '关闭详情面板', '关闭 DSH 右侧详情面板。', 'dsh', 'global', () => this.options.onCloseDetails?.() ?? false),
      event(HOTKEY_EVENT_IDS.dshReconnect, '重新连接 Host', '立即重置重试进度并重新连接 DSH Host。', 'dsh', 'global', () => this.options.onReconnect?.() ?? false),
      event(HOTKEY_EVENT_IDS.dshFocusComposer, '聚焦输入框', '把键盘焦点移动到当前会话输入框。', 'dsh', 'global', () => this.focusComposer()),
      event(HOTKEY_EVENT_IDS.historyPrevious, '上一条历史输入', '光标在开头时恢复当前会话上一条用户输入。', 'dsh-hotkey', 'composer', context => this.navigateHistory(context, 'previous')),
      event(HOTKEY_EVENT_IDS.historyNext, '下一条历史输入', '光标在末尾时前进历史；到末端后恢复原草稿。', 'dsh-hotkey', 'composer', context => this.navigateHistory(context, 'next')),
      event(HOTKEY_EVENT_IDS.cursorPageUp, '光标上移一页', '在编辑器中向上移动十个视觉行；Shift 组合扩展选区。', 'dsh-hotkey', 'composer', context => this.moveCursorPage(context, 'backward')),
      event(HOTKEY_EVENT_IDS.cursorPageDown, '光标下移一页', '在编辑器中向下移动十个视觉行；Shift 组合扩展选区。', 'dsh-hotkey', 'composer', context => this.moveCursorPage(context, 'forward')),
      event(HOTKEY_EVENT_IDS.insertIndent, '插入四个空格', '在光标处插入四个空格。', 'dsh-hotkey', 'composer', context => this.insertText(context, '    ')),
      event(HOTKEY_EVENT_IDS.insertTab, '插入 Tab 字符', '在光标处插入一个 Tab 字符。', 'dsh-hotkey', 'composer', context => this.insertText(context, '\t')),
    ]
  }

  private arbitrate(key: 'up' | 'down' | 'enter' | 'tab'): DispatchOutcome {
    return arbitrateComposerRc1(this.options.getComposerInput?.(), key)
  }

  private dismissComposerMenu(): DispatchOutcome {
    return dismissComposerPopupRc1(this.options.getComposerInput?.())
  }

  private sessionState(): ActiveSessionState {
    return this.options.getSessionState?.() ?? {
      running: this.options.isSessionRunning?.() ?? false,
      subagent: null,
    }
  }

  private submitByPolicy(context: HotkeyExecutionContext, accelerated: boolean): DispatchOutcome {
    const target = context.composer
    if (target === null) return 'continue'
    const input = this.options.getComposerInput?.()
    const snapshot = input?.state?.getSnapshot?.()
    if (snapshot?.phase === 'adjudicating' || snapshot?.phase === 'submitting') return 'handled'
    if (context.keyboardEvent.repeat) return 'handled'
    const popupOpen = isMenuOrPopupOpen()
    if (popupOpen && !hasArbitrateComposerRc1(input)) return 'defer-native'

    const session = this.sessionState()
    const empty = (snapshot?.draft ?? this.readDraft(target, input).text).trim() === ''
      && (snapshot?.imageIds?.length ?? 0) === 0
    const hasQueued = snapshot?.queue?.some(row => row.placement === 'queued') ?? false
    const shouldSteerQueue = accelerated
      && empty
      && session.running
      && session.subagent === null
      && hasQueued
      && !popupOpen
    if (shouldSteerQueue) {
      const outcome = steerQueueRc1(input)
      if (outcome !== 'handled') return outcome
      historyManager.resetNavigation()
      return 'handled'
    }

    const preferred = this.options.getBusyEnterBehavior?.() ?? 'queue'
    const mode: ComposerSubmitMode = !session.running || session.subagent !== null
      ? 'queue'
      : accelerated
        ? (preferred === 'queue' ? 'steer' : 'queue')
        : preferred
    return this.submitExplicit(context, mode)
  }

  private submitExplicit(context: HotkeyExecutionContext, mode: ComposerSubmitMode): DispatchOutcome {
    const target = context.composer
    if (target === null) return 'continue'
    if (context.keyboardEvent.repeat) return 'handled'
    historyManager.resetNavigation()
    return this.submit(target, mode) ? 'handled' : 'continue'
  }

  private insertNewline(context: HotkeyExecutionContext): boolean {
    const target = context.composer
    if (target === null) return false
    historyManager.resetNavigation()
    if (!insertNewlineAtCursor(target)) {
      const current = this.readDraft(target)
      void this.writeDraft(target, this.options.getComposerInput?.(), {
        text: `${current.text}\n`,
        references: current.references,
        images: current.images,
        runtimeImageIds: current.runtimeImageIds,
      }, 'end').catch((error: unknown) => {
        console.warn('[dsh-hotkey] Failed to preserve draft while inserting newline:', error)
      })
    }
    scrollSelectionIntoView(target)
    return true
  }

  private focusComposer(): boolean {
    const composer = getComposerInputElement()
    if (composer === null) return false
    composer.focus({ preventScroll: true })
    return document.activeElement === composer
  }

  private cancelSession(): boolean {
    if (isModalOrPopupOpen()) return false
    if (this.options.isSessionRunning?.() && this.options.onCancelSession !== undefined) {
      void this.options.onCancelSession()
      return true
    }
    const stopButton = findStopButton()
    if (stopButton === null || stopButton.disabled) return false
    stopButton.click()
    return true
  }

  private insertText(context: HotkeyExecutionContext, text: string): boolean {
    const target = context.composer
    if (target === null || isMenuOrPopupOpen()) return false
    insertTextAtCursor(text)
    scrollSelectionIntoView(target)
    return true
  }

  private moveCursorPage(
    context: HotkeyExecutionContext,
    direction: 'backward' | 'forward',
  ): boolean {
    const target = context.composer
    const selection = typeof window === 'undefined' ? null : window.getSelection()
    if (target === null || selection === null || selection.rangeCount === 0) return false
    if (typeof selection.modify !== 'function') return false
    const alter = context.keyboardEvent.shiftKey ? 'extend' : 'move'
    for (let index = 0; index < 10; index += 1) selection.modify(alter, direction, 'line')
    scrollSelectionIntoView(target)
    return true
  }

  /** Browse current-session human messages and restore the captured draft. */
  private navigateHistory(
    context: HotkeyExecutionContext,
    direction: 'previous' | 'next',
  ): boolean {
    const target = context.composer
    if (target === null || isMenuOrPopupOpen()) return false
    const input = this.options.getComposerInput?.()
    const inputState = input?.state?.getSnapshot?.()
    if (inputState?.phase !== undefined && inputState.phase !== 'plain') return false
    if (this.historyRestorePending) return true

    const snapshot = this.options.getSessionHistory?.() ?? { items: [] }
    const currentDraft = this.readDraft(target, input)
    if (direction === 'previous' && isSelectionAtStart(target)) {
      const previous = historyManager.navigateUp(snapshot, currentDraft)
      if (previous === null) return false
      this.beginHistoryRestore(target, input, previous.draft, 'start', false, snapshot.sessionId)
      return true
    }
    if (direction === 'next' && isSelectionAtEnd(target)) {
      const next = historyManager.navigateDown(snapshot, currentDraft)
      if (next === null) return false
      this.beginHistoryRestore(target, input, next.draft, 'end', next.isDraft, snapshot.sessionId)
      return true
    }
    return false
  }

  private readDraft(
    target: HTMLElement,
    input = this.options.getComposerInput?.(),
  ): HistoryDraft {
    try {
      const snapshot = input?.state?.getSnapshot?.()
      if (typeof snapshot?.draft === 'string') {
        const references = (snapshot.occurrences ?? []).flatMap((occurrence): HistoryReference[] => {
          if (
            typeof occurrence.source !== 'string'
            || typeof occurrence.ref !== 'string'
            || typeof occurrence.label !== 'string'
            || typeof occurrence.clipboardText !== 'string'
            || typeof occurrence.offset !== 'number'
            || typeof occurrence.length !== 'number'
          ) return []
          return [{
            start: occurrence.offset,
            end: occurrence.offset + occurrence.length,
            source: occurrence.source,
            ref: occurrence.ref,
            label: occurrence.label,
            ...(occurrence.appearance === undefined ? {} : { appearance: occurrence.appearance }),
            clipboardText: occurrence.clipboardText,
          }]
        })
        const runtimeImageIds = (snapshot.imageIds ?? []).flatMap((id): string[] =>
          typeof id === 'string' ? [id] : [])
        return {
          text: snapshot.draft,
          references,
          images: [],
          runtimeImageIds,
        }
      }
    } catch {
      // Fall back to DOM text.
    }
    return { text: getEditorText(target), references: [], images: [], runtimeImageIds: [] }
  }

  private beginHistoryRestore(
    target: HTMLElement,
    input: ComposerInputFace | undefined,
    draft: HistoryDraft,
    boundary: 'start' | 'end',
    isDraft: boolean,
    sessionId: string | undefined,
  ): void {
    const generation = ++this.historyRestoreGeneration
    this.historyRestorePending = true
    void this.writeDraft(target, input, draft, boundary)
      .then((rendered) => {
        if (!this.isCurrentHistoryRestore(generation, sessionId)) return
        if (!isDraft) historyManager.confirmDisplayed(rendered)
      })
      .catch((error: unknown) => {
        if (!this.isCurrentHistoryRestore(generation, sessionId)) return
        console.warn('[dsh-hotkey] Failed to restore history images:', error)
        if (!isDraft) historyManager.confirmDisplayed(this.readDraft(target, input))
      })
      .finally(() => {
        if (generation === this.historyRestoreGeneration) this.historyRestorePending = false
      })
  }

  private isCurrentHistoryRestore(generation: number, sessionId: string | undefined): boolean {
    if (generation !== this.historyRestoreGeneration) return false
    return sessionId === undefined
      || this.options.getActiveSessionId === undefined
      || this.options.getActiveSessionId() === sessionId
  }

  private async writeDraft(
    target: HTMLElement,
    input: ComposerInputFace | undefined,
    draft: HistoryDraft,
    boundary: 'start' | 'end',
  ): Promise<HistoryDraft> {
    if (input?.setDraft) {
      const currentImageIds = (input.state?.getSnapshot?.()?.imageIds ?? [])
        .flatMap((id): string[] => typeof id === 'string' ? [id] : [])
      const targetRuntimeIds = new Set(draft.runtimeImageIds)
      input.setDraft(draft.text)
      for (const id of currentImageIds) {
        if (!targetRuntimeIds.has(id)) input.removeImage?.(id)
      }
      this.restoreReferences(input, draft)
      if (draft.runtimeImageIds.length > 0) {
        const missing = draft.runtimeImageIds.filter(id => !currentImageIds.includes(id))
        if (missing.length > 0 && input.addImages) input.addImages(missing)
      } else if (draft.images.length > 0) {
        await this.options.restoreHistoryImages?.(draft.images, input)
      }
      setCaretAtBoundary(target, boundary)
      queueMicrotask(() => {
        if (target.isConnected) setCaretAtBoundary(target, boundary)
      })
      return this.readDraft(target, input)
    }
    setEditorText(target, draft.text, boundary)
    return { text: draft.text, references: [], images: [], runtimeImageIds: [] }
  }

  private restoreReferences(input: ComposerInputFace, draft: HistoryDraft): void {
    if (!input.insertReference || draft.references.length === 0) return
    const references = [...draft.references].sort((left, right) => right.start - left.start)
    for (const reference of references) {
      if (
        reference.start < 0
        || reference.end <= reference.start
        || reference.end > draft.text.length
        || draft.text.slice(reference.start, reference.end) !== reference.clipboardText
      ) continue
      const draftRev = input.state?.getSnapshot?.()?.draftRev
      if (typeof draftRev !== 'number') return
      input.insertReference({
        source: reference.source,
        ref: reference.ref,
        label: reference.label,
        ...(reference.appearance === undefined ? {} : { appearance: reference.appearance }),
        clipboardText: reference.clipboardText,
      }, {
        start: reference.start,
        end: reference.end,
        draftRev,
      })
    }
  }

  /** Submit through DSH's official per-session input machine. */
  private submit(target: HTMLElement, mode: ComposerSubmitMode): boolean {
    if (submitWithPublicInput(this.options.getComposerInput?.(), mode)) return true

    // The visible arrow button is queue-only. Never silently downgrade an
    // explicit steer request when the official input facade is unavailable.
    if (mode === 'steer') return false
    const sendBtn = findSendButton(target)
    if (!sendBtn || sendBtn.disabled) return false
    sendBtn.click()
    return true
  }
}

export const hotkeyInterceptor = new HotkeyInterceptor(undefined, hotkeyEventRegistry)
