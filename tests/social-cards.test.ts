import { describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import { join, resolve } from 'node:path'
import {
  genericSocialCard,
  renderSocialCard,
  SOCIAL_CARD_HEIGHT,
  SOCIAL_CARD_WIDTH,
  socialCardPath,
} from '../src/lib/social-cards'

describe('social cards', () => {
  it('maps canonical site paths to stable generated card paths', () => {
    expect(socialCardPath('/')).toBe('/og/home.png')
    expect(socialCardPath('/posts')).toBe('/og/posts.png')
    expect(socialCardPath('/test/')).toBe('/og/test.png')
    expect(socialCardPath('/search')).toBe('/og/search.png')
    expect(socialCardPath('/links')).toBe('/og/links.png')
    expect(socialCardPath('/posts/game-pikurn')).toBe('/og/posts/game-pikurn.png')
  })

  it('renders and reuses a deterministic 1200 by 630 PNG from pinned local fonts', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'cade-social-card-'))
    const first = await renderSocialCard(genericSocialCard('/'), { cacheDir })
    const second = await renderSocialCard(genericSocialCard('/'), { cacheDir })
    expect(first.equals(second)).toBe(true)
    expect(await readdir(cacheDir)).toHaveLength(1)
    expect(await sharp(first).metadata()).toMatchObject({
      format: 'png',
      width: SOCIAL_CARD_WIDTH,
      height: SOCIAL_CARD_HEIGHT,
    })
    await rm(cacheDir, { recursive: true })
  })

  it('embeds a local article cover without fetching a reader-visible URL', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'cade-social-card-'))
    const png = await renderSocialCard(
      {
        title: 'Pikurn: A Betting Game with a Twist',
        blurb: 'Two greens, one red, and $100.',
        label: 'cade.io',
        coverPath: resolve('content/posts/game-pikurn/pikurn-risk-balance.png'),
      },
      { cacheDir }
    )
    expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 1200, height: 630 })
    await rm(cacheDir, { recursive: true })
  })

  it('renders unusually long title and blurb copy without exceeding the card bounds', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'cade-social-card-'))
    const png = await renderSocialCard(
      { title: 'A '.repeat(120), blurb: 'A longer description '.repeat(80), label: 'cade.io' },
      { cacheDir }
    )
    expect(await sharp(png).metadata()).toMatchObject({ width: 1200, height: 630 })
    await rm(cacheDir, { recursive: true })
  })
})
