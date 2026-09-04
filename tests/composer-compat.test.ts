import assert from 'node:assert/strict'
import test from 'node:test'
import {
  arbitrateComposerRc1,
  dismissComposerPopupRc1,
  steerQueueRc1,
} from '../src/client/adapters/dsh-composer-compat-rc1.ts'

test('rc.1 private capability gaps explicitly defer or continue', () => {
  assert.equal(arbitrateComposerRc1({}, 'enter'), 'continue')
  assert.equal(dismissComposerPopupRc1({}), 'defer-native')
  assert.equal(steerQueueRc1({}), 'defer-native')
})

test('rc.1 compatibility bridge never converts steer into queue', () => {
  let steers = 0
  assert.equal(steerQueueRc1({ steerQueue: () => { steers += 1 } }), 'handled')
  assert.equal(steers, 1)
})

test('rc.1 menu arbitration preserves DSH verdicts', () => {
  assert.equal(arbitrateComposerRc1({ arbitrate: () => 'pass' }, 'up'), 'continue')
  assert.equal(arbitrateComposerRc1({ arbitrate: () => 'consumed' }, 'up'), 'handled')
  let dismissed = 0
  assert.equal(dismissComposerPopupRc1({
    dismissPopup: () => { dismissed += 1 },
    arbitrate: () => 'pick-highlighted',
  }), 'handled')
  assert.equal(dismissed, 1)
})
