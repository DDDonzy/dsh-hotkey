import assert from 'node:assert/strict'
import test from 'node:test'
import { InputHistoryManager, type HistoryDraft } from '../src/client/history.ts'

const draft = (text: string): HistoryDraft => ({
  text,
  references: [],
  images: [],
  runtimeImageIds: [],
})

test('browses newest to oldest, then restores the captured draft', () => {
  const history = new InputHistoryManager()
  const snapshot = { sessionId: 's1', items: [draft('latest'), draft('older')] }

  assert.deepEqual(history.navigateUp(snapshot, draft('draft')), { draft: draft('latest'), isDraft: false })
  assert.deepEqual(history.navigateUp(snapshot, draft('latest')), { draft: draft('older'), isDraft: false })
  assert.deepEqual(history.navigateDown(snapshot, draft('older')), { draft: draft('latest'), isDraft: false })
  assert.deepEqual(history.navigateDown(snapshot, draft('latest')), { draft: draft('draft'), isDraft: true })
  assert.equal(history.isNavigating(), false)
})

test('editing recalled history makes it the new draft and restarts at latest', () => {
  const history = new InputHistoryManager()
  const snapshot = { sessionId: 's1', items: [draft('latest'), draft('older')] }

  assert.deepEqual(history.navigateUp(snapshot, draft('original draft')), { draft: draft('latest'), isDraft: false })
  assert.deepEqual(history.navigateUp(snapshot, draft('edited recalled text')), { draft: draft('latest'), isDraft: false })
  assert.deepEqual(
    history.navigateDown(snapshot, draft('latest')),
    { draft: draft('edited recalled text'), isDraft: true },
  )
})

test('switching sessions resets navigation and keeps each current draft', () => {
  const history = new InputHistoryManager()

  assert.deepEqual(
    history.navigateUp({ sessionId: 's1', items: [draft('one')] }, draft('draft one')),
    { draft: draft('one'), isDraft: false },
  )
  assert.deepEqual(
    history.navigateUp({ sessionId: 's2', items: [draft('two')] }, draft('draft two')),
    { draft: draft('two'), isDraft: false },
  )
  assert.deepEqual(
    history.navigateDown({ sessionId: 's2', items: [draft('two')] }, draft('two')),
    { draft: draft('draft two'), isDraft: true },
  )
})

test('structured reference and image metadata participate in edit detection', () => {
  const history = new InputHistoryManager()
  const withChip: HistoryDraft = {
    text: '@README.md',
    references: [{
      start: 0, end: 10, source: 'reference', ref: '@README.md',
      label: 'README.md', appearance: 'file', clipboardText: '@README.md',
    }],
    images: [{ attachmentId: 'sha256:image', mediaType: 'image/png', name: 'image.png' }],
    runtimeImageIds: [],
  }
  const snapshot = { sessionId: 's1', items: [withChip] }
  assert.deepEqual(history.navigateUp(snapshot, withChip), { draft: withChip, isDraft: false })
  assert.equal(history.navigateDown(snapshot, {
    ...withChip,
    images: [{ ...withChip.images[0]!, name: 'other.png' }],
  }), null)

  history.resetNavigation()
  assert.deepEqual(history.navigateUp(snapshot, draft('draft')), { draft: withChip, isDraft: false })
  assert.deepEqual(history.navigateDown(snapshot, withChip), { draft: draft('draft'), isDraft: true })
})
