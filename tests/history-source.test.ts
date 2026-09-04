import assert from 'node:assert/strict'
import test from 'node:test'
import { draftFromContent, draftFromText, formatSessionMention } from '../src/client/history-source.ts'

test('parses file, quoted file, and folder references for chip reconstruction', () => {
  const text = 'open @README.md and @"docs/a b.md" then @src/'
  const draft = draftFromText(text)
  assert.equal(draft.text, text)
  assert.deepEqual(draft.references.map(reference => ({
    ref: reference.ref,
    label: reference.label,
    appearance: reference.appearance,
  })), [
    { ref: '@README.md', label: 'README.md', appearance: 'file' },
    { ref: '@"docs/a b.md"', label: 'a b.md', appearance: 'file' },
    { ref: '@src/', label: 'src/', appearance: 'folder' },
  ])
})

test('rebuilds canonical session mention from the following recall sidecar', () => {
  const sessionId = 'source-session'
  const mention = formatSessionMention(sessionId, 'Research')
  const draft = draftFromText('compare @Research', [
    { sessionId, label: 'Research', inputIndex: 0 },
  ])
  assert.equal(draft.text, `compare ${mention}`)
  assert.deepEqual(draft.references, [{
    start: 8,
    end: 8 + mention.length,
    source: 'reference',
    ref: mention,
    label: 'Research',
    appearance: 'session',
    clipboardText: mention,
  }])
})

test('preserves ordinary Markdown hyperlinks as exact editor text', () => {
  const text = '[DeepSeek](https://deepseek.com)'
  assert.deepEqual(draftFromText(text), {
    text,
    references: [],
    images: [],
    runtimeImageIds: [],
  })
})

test('extracts durable image blocks without losing adjacent text', () => {
  const draft = draftFromContent([
    { type: 'image', attachment: {
      attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 12,
      width: 3, height: 4, name: 'photo.png',
    } },
    { type: 'text', text: 'look at this' },
    { type: 'image', attachment: {
      attachmentId: 'sha256:def', mediaType: 'image/jpeg', bytes: 20,
      width: 5, height: 6,
    } },
  ])
  assert.equal(draft?.text, 'look at this')
  assert.deepEqual(draft?.images, [
    {
      attachmentId: 'sha256:abc', mediaType: 'image/png', bytes: 12,
      width: 3, height: 4, name: 'photo.png',
    },
    {
      attachmentId: 'sha256:def', mediaType: 'image/jpeg', bytes: 20,
      width: 5, height: 6,
    },
  ])
  assert.deepEqual(draft?.runtimeImageIds, [])
})

test('keeps an image-only message in history', () => {
  const draft = draftFromContent([{
    type: 'image', attachment: {
      attachmentId: 'sha256:only', mediaType: 'image/webp', bytes: 1,
      width: 1, height: 1,
    },
  }])
  assert.equal(draft?.text, '')
  assert.equal(draft?.images.length, 1)
})
