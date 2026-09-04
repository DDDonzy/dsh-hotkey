/**
 * Public DSH SessionInput-facing operations.
 *
 * This module intentionally contains no ComposerKeyboard members. It may use
 * only the outward SessionInput shape available in DSH 0.1.2-rc.1.
 */

export type ComposerSubmitMode = 'queue' | 'steer'

export interface ComposerInputFace {
  readonly state?: {
    getSnapshot?: () => {
      draft?: string
      draftRev?: number
      imageIds?: readonly unknown[]
      phase?: string
      occurrences?: readonly {
        source?: string
        ref?: string
        label?: string
        appearance?: 'session' | 'file' | 'folder'
        clipboardText?: string
        offset?: number
        length?: number
      }[]
      queue?: readonly { placement?: string }[]
    }
  }
  setDraft?: (text: string) => void
  addImages?: (ids: readonly string[]) => boolean
  removeImage?: (id: string) => void
  pruneImages?: (ids: readonly string[]) => void
  insertReference?: (
    reference: {
      source: string
      ref: string
      label: string
      appearance?: 'session' | 'file' | 'folder'
      clipboardText: string
    },
    span: { start: number; end: number; draftRev: number },
  ) => boolean
  submit?: (mode?: ComposerSubmitMode) => void
}

/** Run the public input-machine submit API and report whether it accepted work. */
export function submitWithPublicInput(input: ComposerInputFace | undefined, mode: ComposerSubmitMode): boolean {
  try {
    if (input?.submit === undefined) return false
    input.submit(mode)
    return true
  } catch {
    return false
  }
}
