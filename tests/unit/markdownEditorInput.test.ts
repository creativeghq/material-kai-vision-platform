import { describe, expect, it } from 'vitest';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxJsxFromMarkdown } from 'mdast-util-mdx-jsx';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mdxJsx } from 'micromark-extension-mdx-jsx';
import { mdxMd } from 'micromark-extension-mdx-md';
import { gfm } from 'micromark-extension-gfm';

import { toEditorMarkdown } from '@/components/shared/markdownEditorInput';

const parseLikeMdxEditor = (md: string) =>
  fromMarkdown(md, {
    extensions: [gfm(), mdxJsx(), mdxMd()],
    mdastExtensions: [gfmFromMarkdown(), mdxJsxFromMarkdown()],
  });

// Shapes measured in live kb_docs that opened blank in the admin editor.
const BROKEN = [
  '- **Probability:** High (>60%) / Medium (30-60%) / Low (<30%)',
  '| Status (current / superseded by <file> / unreadable attachment) |\n|---|',
  'Latency < 5s and cost <= budget',
  'Owner: <owner>, due <date>',
  'Line one<br>line two',
  'arrows <- and <->',
];

describe('toEditorMarkdown', () => {
  it.each(BROKEN)('turns an MDX parse failure into a clean parse: %s', (md) => {
    expect(() => parseLikeMdxEditor(md)).toThrow();
    expect(() => parseLikeMdxEditor(toEditorMarkdown(md))).not.toThrow();
  });

  it('leaves code untouched', () => {
    const md = 'Use `a <b> c` here\n\n```svg\n<svg><title>x</title></svg>\n```\n\n~~~\n<file>\n~~~';
    expect(toEditorMarkdown(md)).toBe(md);
  });

  it('keeps the tags the editor itself writes, and comments', () => {
    const md = '<u>under</u> x<sup>2</sup> H<sub>2</sub>O';
    expect(toEditorMarkdown(md)).toBe(md);
    expect(() => parseLikeMdxEditor(md)).not.toThrow();
    expect(toEditorMarkdown('a <!-- note -->')).toBe('a <!-- note -->');
  });

  it('does not double-escape', () => {
    expect(toEditorMarkdown('a \\<b')).toBe('a \\<b');
  });

  it('round-trips the literal text', () => {
    const tree = parseLikeMdxEditor(toEditorMarkdown('Low (<30%)'));
    expect(JSON.stringify(tree)).toContain('Low (<30%)');
  });
});
