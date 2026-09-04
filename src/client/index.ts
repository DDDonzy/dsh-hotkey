/**
 * dsh-hotkey, browser half.
 *
 * Registers a "Hotkey" page and starts an ordered event dispatcher. Keyboard
 * interception runs at window-capture level because DSH exposes no public
 * keybinding registry. A handled binding intentionally replaces the native
 * Lexical keymap path; unhandled and unsupported private-capability paths fail
 * open so DSH can process the original event.
 */

import {
  hotkeyInterceptor,
  type ComposerInputFace,
} from './interceptor.ts'
import { hotkeyEventRegistry } from './events.ts'
import type { HistoryDraft, HistoryImage, SessionHistorySnapshot } from './history.ts'
import { draftFromContent, draftFromText } from './history-source.ts'
import {
  hotkeyStore,
  type HotkeySettingsScope,
} from './store.ts'
import {
  HOTKEY_SETTINGS_NAMESPACE,
  normalizeHotkeySettings,
  type HotkeySettings,
} from './types.ts'
import { HotkeyPluginCard } from './HotkeyPluginCard.tsx'

/**
 * The registry provider has no DSH UI dependency. Contributions are installed
 * on child fibers below once their own services become available.
 */
export const inject = [] as const

/** Cordis plugin name. */
export const name = 'dsh-hotkey'

/** Programmatic registry export in addition to the `hotkeyRegistry` Cordis service. */
export { hotkeyEventRegistry }
export type {
  DispatchOutcome,
  HotkeyActionContext,
  HotkeyActionDefinition,
  HotkeyActionScope,
  HotkeyEventDefinition,
  HotkeyEventRegistryFace,
  HotkeyExecutionContext,
  HotkeyRegistryV1,
} from './events.ts'
export {
  DEFAULT_HOTKEY_BINDINGS,
  DEFAULT_HOTKEY_SETTINGS,
  DSH_DEFAULT_HOTKEY_BINDINGS,
  PLUGIN_PRESET3_BINDINGS,
  HOTKEY_EVENT_IDS,
  HOTKEY_SETTINGS_NAMESPACE,
  HOTKEY_SETTINGS_SCHEMA_VERSION,
} from './types.ts'
export type { HotkeyBinding, HotkeySettings } from './types.ts'

/** Structural view of the Cordis context the loader passes to `apply`. */
interface CordisFiber {
  dispose?: () => void
}

interface CordisContext {
  get?: (id: string) => unknown
  provide?: (id: string, value: unknown) => unknown
  /** Cordis reloads this child fiber when its required services change. */
  inject?: (dependencies: readonly string[], callback: (child: CordisContext) => void | (() => void)) => CordisFiber
}

interface ReadSettingsScope<T> {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value?: T
    writable: boolean
    mode: 'host' | 'memory'
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

interface SettingsScopeBinder {
  bind<T>(spec: {
    namespace: string
    decode?: (section: unknown) => T | undefined
  }): ReadSettingsScope<T>
}

interface ConversationSettings {
  busyEnter?: 'queue' | 'steer'
}

interface LayoutService {
  toggleSidebar?: () => void
  openDetails?: () => void
  closeDetails?: () => void
}

interface UiWorkspaceService {
  startSession?: () => void
}

interface ConnectionService {
  reconnect?: () => void
}

interface ImageAttachmentShape {
  attachmentId: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  bytes?: number
  width?: number
  height?: number
  name?: string
  originalDimensions?: { width: number; height: number }
}

interface AttachmentReadSuccess {
  ok: true
  value: { attachment: ImageAttachmentShape; data: Uint8Array }
}

interface AttachmentReadFailure {
  ok: false
  error?: { code?: string; message?: string }
}

interface SessionFace {
  getSnapshot?: () => SessionSnapshot
  /** Optional reactive state source exposed by DSH session facades. */
  subscribe?: (listener: () => void) => () => void
  cancel?: () => Promise<unknown>
  readAttachment?: (attachmentId: string) => Promise<AttachmentReadSuccess | AttachmentReadFailure>
}

interface DraftAttachmentShape {
  id: string
  file?: File
  previewUrl?: string
}

interface ConversationService {
  input?: {
    for?: (scope: SessionScopeContext) => ComposerInputFace
  }
  createDraftImages?: (files: readonly File[]) => readonly DraftAttachmentShape[]
  releaseDraftImages?: (attachments: readonly DraftAttachmentShape[]) => void
  releaseDraftImage?: (id: string) => void
}

/** Agent-scoped Cordis context returned by sessions.scope(id). */
interface SessionScopeContext {
  get?: (id: string) => unknown
}

interface SessionEventEntry {
  type?: string
  event?: {
    type?: string
    seq?: number
    time?: number
    surfaceOp?: string
    data?: {
      content?: unknown
      source?: {
        kind?: string
        rpcId?: string
        references?: readonly {
          sessionId?: string
          label?: string
          inputIndex?: number
        }[]
      }
    }
  }
}

interface SessionSnapshot {
  running?: boolean
  subagent?: unknown | null
  queue?: readonly {
    placement?: string
    rpcId?: string
    text?: string | null
    content?: unknown
  }[]
  pendingSubmissions?: readonly {
    requestId?: string
    time?: number
    text?: string
  }[]
}

interface SessionBinding {
  eventSource?: {
    getSnapshot?: () => { entries?: readonly SessionEventEntry[] }
    /** Optional event-window revision notification. */
    subscribe?: (listener: () => void) => () => void
  }
  session?: SessionFace
}

/** Minimal structural view of the client sessions service. */
interface SessionsService {
  list?: { getSnapshot?: () => { current?: string } }
  scope?: (id: string) => SessionScopeContext | undefined
  binding?: (id: string) => SessionBinding | undefined
}

interface SlotsService {
  inject: (name: string, provider: () => unknown) => void
  register: (payload: Record<string, unknown>, component: unknown) => unknown
}

function currentSessionId(sessions: SessionsService | undefined): string | undefined {
  return sessions?.list?.getSnapshot?.()?.current
}

function currentConversationService(sessions: SessionsService | undefined): ConversationService | undefined {
  try {
    const id = currentSessionId(sessions)
    if (id === undefined) return undefined
    const scope = sessions?.scope?.(id)
    return scope?.get?.('conversation') as ConversationService | undefined
  } catch {
    return undefined
  }
}

function imageExtension(mediaType: ImageAttachmentShape['mediaType']): string {
  switch (mediaType) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'png'
  }
}

function historyImageFileName(
  image: HistoryImage,
  index: number,
  attachment: ImageAttachmentShape,
): string {
  const candidate = image.name ?? attachment.name
  const basename = candidate?.split(/[\\/]/u).at(-1)?.replace(/[\u0000-\u001f]/gu, '')
  return basename === undefined || basename === ''
    ? `history-image-${index + 1}.${imageExtension(attachment.mediaType)}`
    : basename
}

async function restoreSessionImages(
  sessions: SessionsService | undefined,
  conversation: ConversationService | undefined,
  images: readonly HistoryImage[],
  input: ComposerInputFace,
): Promise<void> {
  if (images.length === 0) return
  const sessionId = currentSessionId(sessions)
  const session = sessionId === undefined ? undefined : sessions?.binding?.(sessionId)?.session
  const service = conversation ?? currentConversationService(sessions)
  if (session?.readAttachment === undefined) throw new Error('current session cannot read image attachments')
  if (service?.createDraftImages === undefined) throw new Error('conversation image intake is unavailable')
  if (input.addImages === undefined) throw new Error('conversation input cannot add image attachments')

  const files = await Promise.all(images.map(async (image, index) => {
    const result = await session.readAttachment!(image.attachmentId)
    if (!result.ok) {
      const code = result.error?.code ?? 'attachment-read-failed'
      const message = result.error?.message ?? 'image attachment read failed'
      throw new Error(`${code}: ${message}`)
    }
    const attachment = result.value.attachment
    const bytes = result.value.data
    if (!(bytes instanceof Uint8Array)) throw new Error('image attachment returned invalid bytes')
    const fileBytes = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    return new File([
      fileBytes,
    ], historyImageFileName(image, index, attachment), { type: attachment.mediaType })
  }))

  const created = service.createDraftImages(files)
  if (created.length !== files.length) {
    service.releaseDraftImages?.(created)
    throw new Error('conversation created an incomplete image draft')
  }
  const ids = created.map(attachment => attachment.id)
  if (!input.addImages(ids)) {
    service.releaseDraftImages?.(created)
    throw new Error('conversation rejected restored image attachments')
  }
}

function currentComposerInput(sessions: SessionsService | undefined): ComposerInputFace | undefined {
  try {
    const id = currentSessionId(sessions)
    if (id === undefined) return undefined
    const scope = sessions?.scope?.(id)
    if (scope === undefined) return undefined
    const conversation = scope.get?.('conversation') as ConversationService | undefined
    return conversation?.input?.for?.(scope)
  } catch {
    return undefined
  }
}

interface HistoryProjectionCacheEntry {
  readonly binding: SessionBinding
  readonly entries: readonly SessionEventEntry[]
  readonly queue: readonly NonNullable<SessionSnapshot['queue']>[number][]
  readonly pending: readonly NonNullable<SessionSnapshot['pendingSubmissions']>[number][]
  readonly value: SessionHistorySnapshot
  readonly release?: () => void
}

/** Per-session immutable projection cache; avoids rescanning unchanged DSH snapshots on every keydown. */
const historyProjectionCache = new Map<string, HistoryProjectionCacheEntry>()

/** Invalidate a projection when DSH exposes a reactive event/session source. */
function observeHistoryProjection(sessionId: string, binding: SessionBinding): (() => void) | undefined {
  const releases: Array<() => void> = []
  const invalidate = (): void => {
    const current = historyProjectionCache.get(sessionId)
    if (current?.binding !== binding) return
    historyProjectionCache.delete(sessionId)
    current.release?.()
  }
  for (const source of [binding.eventSource, binding.session]) {
    if (source?.subscribe === undefined) continue
    try { releases.push(source.subscribe(invalidate)) } catch { /* optional source unavailable */ }
  }
  if (releases.length === 0) return undefined
  return () => { for (const release of releases) release() }
}

/** Build newest-first direct-human history for the active session. */
function currentSessionHistory(sessions: SessionsService | undefined): SessionHistorySnapshot {
  const sessionId = currentSessionId(sessions)
  if (sessionId === undefined) return { items: [] }
  const binding = sessions?.binding?.(sessionId)
  if (binding === undefined) return { sessionId, items: [] }

  const entries = binding.eventSource?.getSnapshot?.()?.entries ?? []
  const sessionSnapshot = binding.session?.getSnapshot?.()
  const queue = sessionSnapshot?.queue ?? []
  const pendingSubmissions = sessionSnapshot?.pendingSubmissions ?? []
  const cached = historyProjectionCache.get(sessionId)
  if (
    cached?.binding === binding
    && cached.entries === entries
    && cached.queue === queue
    && cached.pending === pendingSubmissions
  ) return cached.value

  const oldestToNewest: HistoryDraft[] = []
  const seenRpcIds = new Set<string>()
  const append = (draft: HistoryDraft | null, rpcId?: string): void => {
    if (draft === null || (draft.text.trim() === '' && draft.images.length === 0)) return
    if (rpcId !== undefined) {
      if (seenRpcIds.has(rpcId)) return
      seenRpcIds.add(rpcId)
    }
    oldestToNewest.push(draft)
  }

  const recallsByMessageSeq = new Map<
    number,
    readonly { sessionId?: string; label?: string; inputIndex?: number }[]
  >()
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event
    if (
      event?.type === 'user/message'
      && typeof event.seq === 'number'
      && event.data?.source?.kind === 'session-reference'
    ) {
      recallsByMessageSeq.set(event.seq - 1, event.data.source.references ?? [])
    }
  }

  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event
    if (event?.type !== 'user/message') continue
    if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') continue
    if (event.data?.source?.kind !== 'user') continue
    const draft = draftFromContent(
      event.data.content,
      typeof event.seq === 'number' ? recallsByMessageSeq.get(event.seq) : undefined,
    )
    append(draft, event.data.source.rpcId)
  }

  for (const row of queue) {
    if (row.placement !== 'queued' && row.placement !== 'steering') continue
    const draft = draftFromContent(row.content)
      ?? (typeof row.text === 'string' ? draftFromText(row.text) : null)
    append(draft, row.rpcId)
  }
  const pending = [...pendingSubmissions]
    .sort((left, right) => (left.time ?? 0) - (right.time ?? 0))
  for (const row of pending) {
    append(typeof row.text === 'string' ? draftFromText(row.text) : null, row.requestId)
  }

  const value: SessionHistorySnapshot = Object.freeze({
    sessionId,
    items: Object.freeze(oldestToNewest.reverse()),
  })
  cached?.release?.()
  historyProjectionCache.set(sessionId, {
    binding,
    entries,
    queue,
    pending: pendingSubmissions,
    value,
    release: observeHistoryProjection(sessionId, binding),
  })
  // Bound inactive sessions so long-lived Web tabs do not retain unbounded
  // event-window arrays merely for a history navigation optimization.
  while (historyProjectionCache.size > 32) {
    const oldest = historyProjectionCache.keys().next().value
    if (oldest === undefined || oldest === sessionId) break
    const evicted = historyProjectionCache.get(oldest)
    historyProjectionCache.delete(oldest)
    evicted?.release?.()
  }
  return value
}

/** Settings shell contribution: independently reloadable from keyboard Actions. */
function installSettingsSlots(ctx: CordisContext): void {
  const slots = ctx.get?.('slots') as SlotsService | undefined
  if (slots === undefined) return
  slots.inject('settings.plugin.item', () => slots.register({
    name: 'settings.plugin.item', key: HOTKEY_SETTINGS_NAMESPACE,
    locale: 'dsh-hotkey', order: 30,
  }, HotkeyPluginCard))
}

/** Keyboard and settings runtime contribution, independent of the Settings shell. */
function installContributions(ctx: CordisContext): () => void {
  const settingsScope = ctx.get?.('settingsScope') as SettingsScopeBinder | undefined
  const durableSettings = settingsScope?.bind<HotkeySettings>({
    namespace: HOTKEY_SETTINGS_NAMESPACE,
    // The Host schema deliberately stays transform-free/wire-safe. This local
    // decoder performs v1 migration and v2 normalization in the browser.
    decode: section => normalizeHotkeySettings(section),
  }) as HotkeySettingsScope | undefined
  const conversationSettings = settingsScope?.bind<ConversationSettings>({
    namespace: 'ui-conversation',
  })
  const releaseSettings = hotkeyStore.bind(durableSettings)

  // 2. Wire the current Session/Conversation services into the interceptor.
  const sessions = ctx.get?.('sessions') as SessionsService | undefined
  const conversation = ctx.get?.('conversation') as ConversationService | undefined
  const layout = ctx.get?.('layout') as LayoutService | undefined
  const uiWorkspace = ctx.get?.('uiWorkspace') as UiWorkspaceService | undefined
  const connection = ctx.get?.('connection') as ConnectionService | undefined
  hotkeyInterceptor.setOptions({
    onStartSession: () => {
      if (uiWorkspace?.startSession === undefined) return false
      uiWorkspace.startSession()
      return true
    },
    onToggleSidebar: () => {
      if (layout?.toggleSidebar === undefined) return false
      layout.toggleSidebar()
      return true
    },
    onOpenDetails: () => {
      if (layout?.openDetails === undefined) return false
      layout.openDetails()
      return true
    },
    onCloseDetails: () => {
      if (layout?.closeDetails === undefined) return false
      layout.closeDetails()
      return true
    },
    onReconnect: () => {
      if (connection?.reconnect === undefined) return false
      connection.reconnect()
      return true
    },
    getComposerInput: () => currentComposerInput(sessions),
    getActiveSessionId: () => currentSessionId(sessions),
    getSessionHistory: () => currentSessionHistory(sessions),
    restoreHistoryImages: (images, input) => restoreSessionImages(sessions, conversation, images, input),
    getBusyEnterBehavior: () => {
      const value = conversationSettings?.getSnapshot().value?.busyEnter
      return value === 'steer' ? 'steer' : 'queue'
    },
    getSessionState: () => {
      try {
        const current = currentSessionId(sessions)
        const snapshot = current === undefined
          ? undefined
          : sessions?.binding?.(current)?.session?.getSnapshot?.()
        return {
          running: snapshot?.running ?? false,
          subagent: snapshot?.subagent ?? null,
        }
      } catch {
        return { running: false, subagent: null }
      }
    },
    isSessionRunning: () => {
      try {
        const current = currentSessionId(sessions)
        if (current === undefined) return false
        return sessions?.binding?.(current)?.session?.getSnapshot?.()?.running ?? false
      } catch {
        return false
      }
    },
    onCancelSession: () => {
      try {
        const current = currentSessionId(sessions)
        if (current === undefined) return false
        const session = sessions?.binding?.(current)?.session
        if (session !== undefined && session.getSnapshot?.()?.running === true && session.cancel) {
          session.cancel().catch(() => {})
          return true
        }
        return false
      } catch {
        return false
      }
    },
  })

  // 3. Start the DOM-level keyboard interceptor.
  const stopInterceptor = hotkeyInterceptor.start()
  return () => {
    stopInterceptor()
    releaseSettings()
  }
}

/**
 * Publish the third-party registry immediately. DSH-specific UI/actions run in
 * a child fiber, so a missing optional UI service can never delay registry
 * availability for another browser plugin.
 */
export function apply(ctx: CordisContext): () => void {
  ctx.provide?.('hotkeyRegistry', hotkeyEventRegistry)
  const runtimeServices = ['sessions', 'settingsScope'] as const
  const runtime = ctx.inject?.(runtimeServices, installContributions)
  const settingsUi = ctx.inject?.(['slots'], installSettingsSlots)
  // The fallback preserves standalone/unit-test behavior for a minimal Context
  // implementation that has no Cordis child-fiber support.
  const fallback = runtime === undefined ? installContributions(ctx) : undefined
  if (settingsUi === undefined) installSettingsSlots(ctx)
  return () => {
    fallback?.()
    runtime?.dispose?.()
    settingsUi?.dispose?.()
  }
}
