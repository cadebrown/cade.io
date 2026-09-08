import type { APIRoute, GetStaticPaths } from 'astro'
import { readFile } from 'node:fs/promises'
import { getPublishedPosts } from '../../../lib/content'
import {
  archiveName,
  createPostArchive,
  discoverPostFiles,
  type PostFile,
} from '../../../lib/post-files'

interface Props {
  file?: PostFile
  files?: PostFile[]
  name: string
}
export const getStaticPaths = (async () => {
  const paths = []
  for (const post of await getPublishedPosts({ includeDrafts: import.meta.env.DEV })) {
    const files = await discoverPostFiles(post.id, post.data.files)
    for (const file of files)
      paths.push({
        params: { id: post.id, file: file.outputName },
        props: { file, name: file.name },
      })
    paths.push({
      params: { id: post.id, file: archiveName(post.id) },
      props: { files, name: archiveName(post.id) },
    })
  }
  return paths
}) satisfies GetStaticPaths

export const GET: APIRoute = async ({ props }) => {
  const { file, files, name } = props as Props
  const bytes = file
    ? new Uint8Array(await readFile(file.sourcePath))
    : await createPostArchive(files!)
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': file?.mime ?? 'application/zip',
      'Content-Disposition': `inline; filename="${name.split('/').at(-1)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
