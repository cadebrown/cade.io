import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import satori from 'satori'
import sharp from 'sharp'
import { SITE_BLURB, SITE_NAME, SITE_TITLE } from '../site'

const require = createRequire(import.meta.url)
export const SOCIAL_CARD_WIDTH = 1200
export const SOCIAL_CARD_HEIGHT = 630

type SocialCard = {
  title: string
  blurb: string
  label: string
  coverPath?: string
}

type SatoriElement = { type: string; props: Record<string, unknown> }
type Cover = { dataUri: string; bytes: Buffer }
type RenderOptions = { cacheDir?: string }

function element(
  type: string,
  props: Record<string, unknown>,
  ...children: Array<SatoriElement | string>
): SatoriElement {
  return { type, props: { ...props, children } }
}

let fonts: Promise<Parameters<typeof satori>[1]['fonts']> | undefined

function cardFonts() {
  fonts ??= Promise.all([
    readFile(require.resolve('@fontsource/ubuntu-mono/files/ubuntu-mono-latin-700-normal.woff')),
    readFile(require.resolve('@fontsource/ubuntu-mono/files/ubuntu-mono-latin-400-normal.woff')),
  ]).then(([bold, normal]) => [
    { name: 'Ubuntu Mono', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'Ubuntu Mono', data: normal, weight: 400 as const, style: 'normal' as const },
  ])
  return fonts
}

function titleSize(title: string, hasCover: boolean): number {
  if (title.length > 105) return hasCover ? 38 : 44
  if (title.length > 78) return hasCover ? 44 : 50
  if (title.length > 58) return hasCover ? 52 : 58
  return 70
}

function truncate(text: string, maximum: number): string {
  if (text.length <= maximum) return text
  const boundary = text.lastIndexOf(' ', maximum - 1)
  return `${text.slice(0, boundary > 0 ? boundary : maximum - 1).trimEnd()}…`
}

async function coverDataUri(path: string | undefined): Promise<Cover | undefined> {
  if (!path) return
  const input = await readFile(path)
  const format =
    {
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }[extname(path).toLowerCase()] ?? 'application/octet-stream'
  return { dataUri: `data:${format};base64,${input.toString('base64')}`, bytes: input }
}

function cacheKey(
  card: SocialCard,
  cover: Cover | undefined,
  fonts: Awaited<ReturnType<typeof cardFonts>>
): string {
  const hash = createHash('sha256')
  hash.update(
    JSON.stringify({
      renderer: `social-card-v3-satori-${require('satori/package.json').version}-sharp-${sharp.versions.vips}`,
      width: SOCIAL_CARD_WIDTH,
      height: SOCIAL_CARD_HEIGHT,
      title: card.title,
      blurb: card.blurb,
      label: card.label,
    })
  )
  for (const font of fonts)
    hash.update(font.data instanceof ArrayBuffer ? new Uint8Array(font.data) : font.data)
  if (cover) hash.update(cover.bytes)
  return hash.digest('hex')
}

async function cachedPng(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path)
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
}

async function saveCachedPng(path: string, png: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, png)
  await rename(temporary, path)
}

/** Map canonical site paths to their deterministic generated social-card path. */
export function socialCardPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return '/og/home.png'
  if (path === '/posts') return '/og/posts.png'
  if (path === '/test') return '/og/test.png'
  if (path === '/search') return '/og/search.png'
  if (path === '/links') return '/og/links.png'
  const post = path.match(/^\/posts\/([a-z0-9-]+)$/)
  return post ? `/og/posts/${post[1]}.png` : '/og/home.png'
}

export function genericSocialCard(pathname: string): SocialCard {
  switch (pathname.replace(/\/+$/, '') || '/') {
    case '/posts':
      return {
        title: 'Posts',
        blurb: 'Research, software, artwork, and essays by Cade Brown.',
        label: SITE_NAME,
      }
    case '/test':
      return {
        title: 'Component lab',
        blurb: 'Images, interactive models, diagrams, and typography for cade.io.',
        label: SITE_NAME,
      }
    case '/search':
      return {
        title: 'Search the notebook',
        blurb: 'Find an idea, an experiment, or a piece of code.',
        label: SITE_NAME,
      }
    case '/links':
      return {
        title: 'Links',
        blurb: 'Resources I use regularly: tools, websites, libraries, and more.',
        label: SITE_NAME,
      }
    default:
      return { title: SITE_TITLE, blurb: SITE_BLURB, label: SITE_NAME }
  }
}

/** Render a local-only, deterministic 1200×630 PNG social card. */
export async function renderSocialCard(
  card: SocialCard,
  { cacheDir = resolve('.astro/social-cards') }: RenderOptions = {}
): Promise<Buffer> {
  const cover = await coverDataUri(card.coverPath)
  const loadedFonts = await cardFonts()
  const cachePath = resolve(cacheDir, `${cacheKey(card, cover, loadedFonts)}.png`)
  const cached = await cachedPng(cachePath)
  if (cached) return cached
  const textWidth = cover ? 700 : 1000
  const title = truncate(card.title, cover ? 112 : 140)
  const blurb = truncate(card.blurb, cover ? 155 : 230)
  const text = element(
    'div',
    {
      style: {
        width: textWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 64px',
      },
    },
    element(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '26px' } },
      element(
        'div',
        {
          style: {
            display: 'flex',
            color: '#55aaff',
            fontFamily: 'Ubuntu Mono',
            fontSize: 24,
            letterSpacing: 2,
            textTransform: 'uppercase',
          },
        },
        card.label
      ),
      element(
        'div',
        {
          style: {
            display: 'flex',
            color: '#eeeeee',
            fontFamily: 'Ubuntu Mono',
            fontWeight: 700,
            fontSize: titleSize(title, Boolean(cover)),
            lineHeight: 1.05,
            letterSpacing: -1.8,
            wordBreak: 'break-word',
          },
        },
        title
      ),
      element(
        'div',
        {
          style: {
            display: 'flex',
            color: '#eeeeee',
            fontFamily: 'Ubuntu Mono',
            fontSize: 30,
            lineHeight: 1.35,
            wordBreak: 'break-word',
          },
        },
        blurb
      )
    ),
    element(
      'div',
      { style: { display: 'flex', color: '#55aaff', fontFamily: 'Ubuntu Mono', fontSize: 22 } },
      'cade.io / notes on computation'
    )
  )
  const children: SatoriElement[] = [text]
  if (cover)
    children.push(
      element('img', {
        src: cover.dataUri,
        width: 500,
        height: SOCIAL_CARD_HEIGHT,
        style: { objectFit: 'cover' },
      })
    )
  const svg = await satori(
    element(
      'div',
      {
        style: {
          width: SOCIAL_CARD_WIDTH,
          height: SOCIAL_CARD_HEIGHT,
          display: 'flex',
          backgroundColor: '#333333',
          border: '18px solid #55aaff',
        },
      },
      ...children
    ) as never,
    { width: SOCIAL_CARD_WIDTH, height: SOCIAL_CARD_HEIGHT, fonts: loadedFonts }
  )
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  await saveCachedPng(cachePath, png)
  return png
}

/** Astro's image metadata retains this source path as a non-enumerable local field. */
export function imageSourcePath(image: unknown): string | undefined {
  if (!image || typeof image !== 'object') return
  const path = (image as { fsPath?: unknown }).fsPath
  return typeof path === 'string' ? path : undefined
}

export type { SocialCard }
