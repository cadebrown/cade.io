import type { APIRoute, GetStaticPaths } from 'astro'
import { getPublishedPosts } from '../../lib/content'
import {
  genericSocialCard,
  imageSourcePath,
  renderSocialCard,
  type SocialCard,
} from '../../lib/social-cards'
import { SITE_NAME } from '../../site'

type Props = { card: SocialCard }

export const getStaticPaths = (async () => {
  const generic = ['/', '/posts', '/test', '/search', '/links'].map((pathname) => ({
    params: { slug: pathname === '/' ? 'home' : pathname.slice(1) },
    props: { card: genericSocialCard(pathname) },
  }))
  const posts = (await getPublishedPosts()).map((post) => ({
    params: { slug: `posts/${post.id}` },
    props: {
      card: {
        title: post.data.title,
        blurb: post.data.blurb,
        label: SITE_NAME,
        coverPath: imageSourcePath(post.data.image),
      },
    },
  }))
  return [...generic, ...posts]
}) satisfies GetStaticPaths

export const GET: APIRoute<Props> = async ({ props }) => {
  const png = Uint8Array.from(await renderSocialCard(props.card))
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
