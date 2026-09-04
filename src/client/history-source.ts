/** Best-effort reconstruction of DSH reference chips from durable user text. */

import type {
  HistoryDraft,
  HistoryImage,
  HistoryImageMediaType,
  HistoryReference,
} from './history.ts'

export interface SessionHistoryReference {
  sessionId?: string
  label?: string
  inputIndex?: number
}

export function encodeSessionReferenceUri(sessionId: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify(sessionId))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `dsh-session:${btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '')}`
}

export function formatSessionMention(sessionId: string, label: string): string {
  const escaped = label.replace(/[\\\]]/gu, match => `\\${match}`)
  return `@[${escaped}](${encodeSessionReferenceUri(sessionId)})`
}

function restoreSessionMentions(
  text: string,
  references: readonly SessionHistoryReference[],
): string {
  let restored = text
  let searchFrom = 0
  const ordered = [...references]
    .sort((left, right) => (left.inputIndex ?? 0) - (right.inputIndex ?? 0))
  for (const reference of ordered) {
    if (typeof reference.sessionId !== 'string' || typeof reference.label !== 'string') continue
    const readable = `@${reference.label}`
    let at = restored.indexOf(readable, searchFrom)
    if (at < 0) at = restored.indexOf(readable)
    if (at < 0) continue
    const mention = formatSessionMention(reference.sessionId, reference.label)
    restored = `${restored.slice(0, at)}${mention}${restored.slice(at + readable.length)}`
    searchFrom = at + mention.length
  }
  return restored
}

function pathLabel(token: string): { label: string; appearance: 'file' | 'folder' } | undefined {
  let path: string
  if (token.startsWith('@"') && token.endsWith('"')) path = token.slice(2, -1)
  else if (token.startsWith('@')) path = token.slice(1)
  else return undefined
  if (path === '') return undefined
  const folder = path.endsWith('/')
  const withoutSlash = folder ? path.slice(0, -1) : path
  const parts = withoutSlash.split(/[\\/]/u)
  const basename = parts.at(-1) ?? withoutSlash
  return {
    label: folder ? `${basename}/` : basename,
    appearance: folder ? 'folder' : 'file',
  }
}

export function referencesIn(text: string): HistoryReference[] {
  const references: HistoryReference[] = []
  const occupied: Array<{ start: number; end: number }> = []
  const sessionPattern = /@\[((?:\\.|[^\\\]])*)\]\((dsh-session:[^\s)]*)\)/gu
  for (const match of text.matchAll(sessionPattern)) {
    if (match.index === undefined || match[0] === undefined || match[1] === undefined) continue
    const start = match.index
    const end = start + match[0].length
    references.push({
      start,
      end,
      source: 'reference',
      ref: match[0],
      label: match[1].replace(/\\(.)/gu, '$1'),
      appearance: 'session',
      clipboardText: match[0],
    })
    occupied.push({ start, end })
  }

  const filePattern = /(^|\s)(@"[^"\r\n]*"|@[^\s]+)/gu
  for (const match of text.matchAll(filePattern)) {
    if (match.index === undefined || match[1] === undefined || match[2] === undefined) continue
    const start = match.index + match[1].length
    const token = match[2]
    const end = start + token.length
    if (occupied.some(range => start < range.end && end > range.start)) continue
    const presentation = pathLabel(token)
    if (presentation === undefined) continue
    references.push({
      start,
      end,
      source: 'reference',
      ref: token,
      label: presentation.label,
      appearance: presentation.appearance,
      clipboardText: token,
    })
  }

  return references.sort((left, right) => left.start - right.start)
}

function isImageMediaType(value: unknown): value is HistoryImageMediaType {
  return value === 'image/png'
    || value === 'image/jpeg'
    || value === 'image/webp'
    || value === 'image/gif'
}

function imageFromBlock(block: unknown): HistoryImage | undefined {
  if (typeof block !== 'object' || block === null) return undefined
  const row = block as { type?: unknown; attachment?: unknown }
  if (row.type !== 'image' || typeof row.attachment !== 'object' || row.attachment === null) return undefined
  const attachment = row.attachment as Record<string, unknown>
  if (typeof attachment.attachmentId !== 'string' || !isImageMediaType(attachment.mediaType)) return undefined
  const image: HistoryImage = {
    attachmentId: attachment.attachmentId,
    mediaType: attachment.mediaType,
  }
  if (typeof attachment.bytes === 'number') image.bytes = attachment.bytes
  if (typeof attachment.width === 'number') image.width = attachment.width
  if (typeof attachment.height === 'number') image.height = attachment.height
  if (typeof attachment.name === 'string' && attachment.name !== '') image.name = attachment.name
  const original = attachment.originalDimensions
  if (
    typeof original === 'object'
    && original !== null
    && typeof (original as { width?: unknown }).width === 'number'
    && typeof (original as { height?: unknown }).height === 'number'
  ) {
    image.originalDimensions = {
      width: (original as { width: number }).width,
      height: (original as { height: number }).height,
    }
  }
  return image
}

/** Project a durable ContentBlock array into editable text and image refs. */
export function draftFromContent(
  content: unknown,
  sessionReferences: readonly SessionHistoryReference[] = [],
): HistoryDraft | null {
  if (!Array.isArray(content)) return null
  let text = ''
  const images: HistoryImage[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const row = block as { type?: unknown; text?: unknown }
    if (row.type === 'text' && typeof row.text === 'string') text += row.text
    const image = imageFromBlock(block)
    if (image !== undefined) images.push(image)
  }
  if (text === '' && images.length === 0) return null
  const projected = draftFromText(text, sessionReferences)
  return { ...projected, images, runtimeImageIds: [] }
}

export function draftFromText(
  text: string,
  sessionReferences: readonly SessionHistoryReference[] = [],
): HistoryDraft {
  const restored = restoreSessionMentions(text, sessionReferences)
  return {
    text: restored,
    references: referencesIn(restored),
    images: [],
    runtimeImageIds: [],
  }
}
