import { describe, expect, it } from 'vitest'
import { explorerSnapshot, wagerSnapshot } from '../content/posts/game-pikurn/pikurn-snapshots'

describe('Pikurn static wager snapshots', () => {
  it('renders the maximum-average default with nonempty charts', () => {
    const snapshot = wagerSnapshot(0, 0)
    expect(snapshot.values).toEqual([400, 200, 100])
    expect(snapshot.mean).toBeCloseTo(700 / 3)
    expect(snapshot.floor).toBe(100)
    expect(snapshot.bars).toContain('<rect')
    expect(snapshot.frontier).toContain('<path')
  })

  it('renders the $200 guarantee with nonempty charts', () => {
    const snapshot = wagerSnapshot(50, 50)
    expect(snapshot.values).toEqual([200, 200, 200])
    expect(snapshot.mean).toBe(200)
    expect(snapshot.floor).toBe(200)
    expect(snapshot.bars).toContain('$200.00')
    expect(snapshot.frontier).toContain('<circle')
  })

  it('provides a complete default explorer presentation without client code', () => {
    const snapshot = explorerSnapshot()
    expect(snapshot.average).toBeCloseTo(700 / 3)
    expect(snapshot.urn).toContain('pk-G')
    expect(snapshot.urn).toContain('pk-R')
    expect(snapshot.distributionMarkup).toContain('pk-bar')
    expect(snapshot.pathsMarkup).toContain('<tr>')
    expect(snapshot.treeMarkup).toContain('Start $100')
  })
})
