import assert from 'node:assert/strict'
import test from 'node:test'

import { computeDynamicMapLayout } from './layout.js'

test('computeDynamicMapLayout keeps the root at the bottom and stacks prerequisites upward', () => {
  const laidOutNodes = computeDynamicMapLayout([
    {
      id: 'root',
      title: 'Gradient descent',
      parentIds: ['parameters', 'learning-rate'],
      orderIndex: 2,
    },
    {
      id: 'parameters',
      title: 'Parameters',
      parentIds: ['weights'],
      orderIndex: 1,
    },
    {
      id: 'learning-rate',
      title: 'Learning rate',
      parentIds: [],
      orderIndex: 0,
    },
    {
      id: 'weights',
      title: 'Weights',
      parentIds: [],
      orderIndex: 0,
    },
  ])

  const positions = new Map(laidOutNodes.map((node) => [node.id, node.layout]))

  assert.ok(positions.get('root').y > positions.get('parameters').y)
  assert.ok(positions.get('parameters').y > positions.get('weights').y)
  assert.equal(positions.get('parameters').y, positions.get('learning-rate').y)
})
