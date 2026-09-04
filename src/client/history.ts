/** Per-session structured input-history navigator for the DSH composer. */

export type HistoryImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface HistoryImage {
  attachmentId: string
  mediaType: HistoryImageMediaType
  bytes?: number
  width?: number
  height?: number
  name?: string
  originalDimensions?: { width: number; height: number }
}

export interface HistoryReference {
  start: number
  end: number
  source: string
  ref: string
  label: string
  appearance?: 'session' | 'file' | 'folder'
  clipboardText: string
}

export interface HistoryDraft {
  text: string
  references: readonly HistoryReference[]
  /** Durable image references found in a session message. */
  images: readonly HistoryImage[]
  /** Browser-owned ids captured from the user's current unsent draft. */
  runtimeImageIds: readonly string[]
}

export interface SessionHistorySnapshot {
  sessionId?: string
  /** User messages ordered newest -> oldest. */
  items: readonly HistoryDraft[]
}

export interface HistoryNavigationResult {
  draft: HistoryDraft
  isDraft: boolean
}

const MAX_HISTORY_ITEMS = 200

function imageKey(image: HistoryImage): string {
  return [
    image.attachmentId,
    image.mediaType,
    image.bytes ?? '',
    image.width ?? '',
    image.height ?? '',
    image.name ?? '',
    image.originalDimensions?.width ?? '',
    image.originalDimensions?.height ?? '',
  ].join('\u0000')
}

function referenceKey(reference: HistoryReference): string {
  return [
    reference.start, reference.end, reference.source, reference.ref,
    reference.label, reference.appearance ?? '', reference.clipboardText,
  ].join('\u0000')
}

export function draftFingerprint(draft: HistoryDraft): string {
  return [
    draft.text,
    draft.references.map(referenceKey).join('\u0002'),
    draft.images.map(imageKey).join('\u0002'),
    draft.runtimeImageIds.join('\u0002'),
  ].join('\u0001')
}

function ownDraft(draft: HistoryDraft): HistoryDraft {
  return {
    text: draft.text,
    references: draft.references.map(reference => ({ ...reference })),
    images: draft.images.map(image => ({
      ...image,
      ...(image.originalDimensions === undefined ? {} : {
        originalDimensions: { ...image.originalDimensions },
      }),
    })),
    runtimeImageIds: [...draft.runtimeImageIds],
  }
}

export class InputHistoryManager {
  private sessionId: string | undefined
  private history: readonly HistoryDraft[] = []
  private currentIndex = -1
  private tempDraft: HistoryDraft = { text: '', references: [], images: [], runtimeImageIds: [] }
  private displayedFingerprint: string | null = null

  isNavigating(): boolean {
    return this.currentIndex !== -1
  }

  getCurrentIndex(): number {
    return this.currentIndex
  }

  resetNavigation(): void {
    this.history = []
    this.currentIndex = -1
    this.tempDraft = { text: '', references: [], images: [], runtimeImageIds: [] }
    this.displayedFingerprint = null
  }

  /** Adopt the actual structured draft after DSH rebuilt its reference chips. */
  confirmDisplayed(draft: HistoryDraft): void {
    if (this.currentIndex === -1) return
    this.displayedFingerprint = draftFingerprint(draft)
  }

  navigateUp(
    snapshot: SessionHistorySnapshot,
    currentDraft: HistoryDraft,
  ): HistoryNavigationResult | null {
    this.adoptSession(snapshot.sessionId)

    if (
      this.currentIndex !== -1
      && this.displayedFingerprint !== draftFingerprint(currentDraft)
    ) {
      this.resetNavigation()
    }

    if (this.currentIndex === -1) {
      const fresh = snapshot.items
        .filter(item => item.text.trim().length > 0 || item.images.length > 0 || item.runtimeImageIds.length > 0)
        .slice(0, MAX_HISTORY_ITEMS)
        .map(ownDraft)
      if (fresh.length === 0) return null
      this.history = fresh
      this.tempDraft = ownDraft(currentDraft)
      this.currentIndex = 0
      const draft = ownDraft(fresh[0]!)
      this.displayedFingerprint = draftFingerprint(draft)
      return { draft, isDraft: false }
    }

    if (this.currentIndex < this.history.length - 1) this.currentIndex += 1
    const draft = ownDraft(this.history[this.currentIndex]!)
    this.displayedFingerprint = draftFingerprint(draft)
    return { draft, isDraft: false }
  }

  navigateDown(
    snapshot: SessionHistorySnapshot,
    currentDraft: HistoryDraft,
  ): HistoryNavigationResult | null {
    this.adoptSession(snapshot.sessionId)
    if (this.currentIndex === -1) return null

    if (this.displayedFingerprint !== draftFingerprint(currentDraft)) {
      this.resetNavigation()
      return null
    }

    if (this.currentIndex > 0) {
      this.currentIndex -= 1
      const draft = ownDraft(this.history[this.currentIndex]!)
      this.displayedFingerprint = draftFingerprint(draft)
      return { draft, isDraft: false }
    }

    const draft = ownDraft(this.tempDraft)
    this.resetNavigation()
    return { draft, isDraft: true }
  }

  private adoptSession(sessionId: string | undefined): void {
    if (sessionId === this.sessionId) return
    this.sessionId = sessionId
    this.resetNavigation()
  }
}

export const historyManager = new InputHistoryManager()
