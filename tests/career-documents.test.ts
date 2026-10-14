import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  careerSections,
  careerIntroGroups,
  validateCareerDocument,
} from '../src/lib/career-documents'

const pdf = Buffer.from('%PDF-test-fixture')
const sample = () => ({
  schemaVersion: 1,
  kind: 'resume',
  mode: 'review',
  updated: '2026-10-13',
  pdfSha256: createHash('sha256').update(pdf).digest('hex'),
  blocks: [
    { type: 'name', text: 'Sample Person' },
    { type: 'heading', text: 'Experience' },
    { type: 'bullet', text: 'A selected contribution.' },
    { type: 'heading', text: 'Experience' },
    { type: 'paragraph', text: 'Earlier work.' },
  ],
})

describe('career snapshot boundary', () => {
  it('preserves interleaved intro paragraphs, contacts, and headlines', () => {
    const blocks = [
      { type: 'name' as const, text: 'Sample Person' },
      { type: 'contact' as const, text: 'First contact' },
      { type: 'paragraph' as const, text: 'Introductory context' },
      { type: 'headline' as const, text: 'Researcher' },
      { type: 'contact' as const, text: 'Second contact' },
      { type: 'link' as const, text: 'Third contact' },
    ]
    expect(careerIntroGroups(blocks).flatMap((group) => group.blocks)).toEqual(blocks)
    expect(careerIntroGroups(blocks).at(-1)?.blocks).toHaveLength(2)
  })
  it('rejects review data in a public build and mismatched PDF bytes', () => {
    expect(() => validateCareerDocument(sample(), pdf, 'resume', 'public')).toThrow(/mode mismatch/)
    expect(() =>
      validateCareerDocument(sample(), Buffer.from('%PDF-other'), 'resume', 'review')
    ).toThrow(/does not match/)
  })
  it('rejects private fields at either level and unsafe links', () => {
    expect(() =>
      validateCareerDocument({ ...sample(), approvals: [] }, pdf, 'resume', 'review')
    ).toThrow(/fields/)
    const privateBlock = sample()
    Object.assign(privateBlock.blocks[0], { fact_ids: ['private-id'] })
    expect(() => validateCareerDocument(privateBlock, pdf, 'resume', 'review')).toThrow(/private/)
    const unsafeLink = sample()
    unsafeLink.blocks.push({ type: 'link', text: 'Contact', url: 'javascript:alert(1)' } as never)
    expect(() => validateCareerDocument(unsafeLink, pdf, 'resume', 'review')).toThrow(/link/)
  })
  it('preserves document order and assigns unique anchors to repeated headings', () => {
    const document = validateCareerDocument(sample(), pdf, 'resume', 'review')
    const grouped = careerSections(document.blocks)
    expect(grouped.intro.map((block) => block.text)).toEqual(['Sample Person'])
    expect(grouped.sections.map((section) => section.id)).toEqual(['experience-1', 'experience-2'])
    expect(
      grouped.sections.flatMap((section) => section.blocks.map((block) => block.text))
    ).toEqual(['A selected contribution.', 'Earlier work.'])
  })
})
