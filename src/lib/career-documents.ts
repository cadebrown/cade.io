import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export type CareerKind = 'resume' | 'cv'
export type CareerBlock = {
  type:
    | 'name'
    | 'headline'
    | 'contact'
    | 'heading'
    | 'role'
    | 'meta'
    | 'paragraph'
    | 'bullet'
    | 'link'
    | 'page_break'
  text?: string
  url?: string
}
export type CareerDocument = {
  schemaVersion: 1
  kind: CareerKind
  mode: 'review' | 'public'
  updated: string
  pdfSha256: string
  blocks: CareerBlock[]
}
const blockTypes = new Set([
  'name',
  'headline',
  'contact',
  'heading',
  'role',
  'meta',
  'paragraph',
  'bullet',
  'link',
  'page_break',
])

/** Reject accidental imports of the private Findwork bundle, including its nested metadata. */
export function validateCareerDocument(
  value: unknown,
  pdf: Uint8Array,
  kind: CareerKind,
  mode: 'review' | 'public'
): CareerDocument {
  if (!value || typeof value !== 'object') throw new Error('Missing career document')
  const document = value as CareerDocument
  const keys = ['schemaVersion', 'kind', 'mode', 'updated', 'pdfSha256', 'blocks']
  if (
    Object.keys(document).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in document))
  )
    throw new Error('Unexpected career document fields')
  if (document.schemaVersion !== 1 || document.kind !== kind || document.mode !== mode)
    throw new Error('Career document identity or review mode mismatch')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document.updated)) throw new Error('Missing document date')
  if (
    document.pdfSha256 !== createHash('sha256').update(pdf).digest('hex') ||
    Buffer.from(pdf).subarray(0, 5).toString() !== '%PDF-'
  )
    throw new Error('Career PDF does not match its content snapshot')
  if (!Array.isArray(document.blocks) || !document.blocks.length)
    throw new Error('Empty career document')
  for (const block of document.blocks) {
    if (
      !block ||
      typeof block !== 'object' ||
      Object.keys(block).some((key) => !['type', 'text', 'url'].includes(key)) ||
      !blockTypes.has(block.type)
    )
      throw new Error('Invalid or private career block fields')
    if (block.type === 'page_break') {
      if (Object.keys(block).length !== 1) throw new Error('Invalid page break')
      continue
    }
    if (typeof block.text !== 'string' || !block.text.trim()) throw new Error('Empty career text')
    if (block.url !== undefined) {
      if (
        !['contact', 'link'].includes(block.type) ||
        !['https:', 'mailto:'].includes(new URL(block.url).protocol)
      )
        throw new Error('Unsupported career link')
    }
  }
  if (
    document.blocks.filter((block) => block.type === 'name').length !== 1 ||
    document.blocks[0].type !== 'name'
  )
    throw new Error('Career document must start with one name')
  return document
}

export async function readCareerDocument(
  directory: string,
  kind: CareerKind,
  mode: 'review' | 'public'
) {
  const [json, pdf] = await Promise.all([
    readFile(join(directory, kind, 'document.json'), 'utf8'),
    readFile(
      mode === 'public'
        ? resolve(directory, '../../assets', `cade-brown-${kind}.pdf`)
        : join(directory, kind, 'document.pdf')
    ),
  ])
  return { document: validateCareerDocument(JSON.parse(json), pdf, kind, mode), pdf }
}

export function careerSections(blocks: CareerBlock[]) {
  const intro: CareerBlock[] = []
  const sections: { id: string; title: string; blocks: CareerBlock[] }[] = []
  for (const block of blocks) {
    if (block.type === 'heading') {
      const slug = block
        .text!.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      sections.push({ id: `${slug}-${sections.length + 1}`, title: block.text!, blocks: [] })
    } else if (sections.length) sections[sections.length - 1].blocks.push(block)
    else intro.push(block)
  }
  return { intro, sections }
}

export function careerIntroGroups(blocks: CareerBlock[]) {
  const groups: { contacts: boolean; blocks: CareerBlock[] }[] = []
  for (const block of blocks) {
    const contacts = block.type === 'contact' || block.type === 'link'
    if (contacts && groups.at(-1)?.contacts) groups.at(-1)!.blocks.push(block)
    else groups.push({ contacts, blocks: [block] })
  }
  return groups
}
