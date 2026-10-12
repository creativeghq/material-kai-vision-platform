import { isConclusionHeading, isFaqHeading } from './articleSections';

export type ArticleBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: { t?: string; d: string }[] }
  | { type: 'callout'; kind: 'definition' | 'warning' | 'example' | 'info'; label: string; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'image'; src: string; alt: string };

export interface StructuredArticle {
  heading: string;
  intro: string;
  summary: { text: string; points: string[] } | null;
  keyPoints: string[];
  sections: { h: string; blocks: ArticleBlock[] }[];
  faqs: { q: string; a: string }[];
  closing: { h: string; paragraphs: string[]; links: { label: string; to: string }[] } | null;
}

const CALLOUT_KINDS = new Set(['definition', 'warning', 'example', 'info']);
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

function localiseLinks(text: string, origin: string | null): string {
  if (!origin) return text;
  return text.replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g, (link, label: string, url: string) => {
    if (!url.startsWith(origin)) return link;
    return `[${label}](${url.slice(origin.length) || '/'})`;
  });
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function blocksOf(lines: string[], origin: string | null): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const text = (s: string) => localiseLinks(s.trim(), origin);
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const image = IMAGE_LINE.exec(line.trim());
    if (image) { blocks.push({ type: 'image', alt: image[1], src: image[2] }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      const marker = /^\[!(\w+)\]\s*(.*)$/.exec(quote[0] ?? '');
      const kind = marker?.[1].toLowerCase() ?? 'info';
      const body = (marker ? quote.slice(1) : quote).join(' ').replace(/\s+/g, ' ');
      blocks.push({
        type: 'callout',
        kind: (CALLOUT_KINDS.has(kind) ? kind : 'info') as 'definition' | 'warning' | 'example' | 'info',
        label: text(marker?.[2] ?? ''),
        text: text(body),
      });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{3,}/.test(r));
      if (body.length) blocks.push({ type: 'table', head: splitRow(body[0]).map(text), rows: body.slice(1).map((r) => splitRow(r).map(text)) });
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: { t?: string; d: string }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const item = lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        const lead = /^\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)$/.exec(item);
        items.push(lead && lead[2] ? { t: text(lead[1].replace(/[:.]$/, '')), d: text(lead[2]) } : { d: text(item) });
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(>|\||[-*+]\s|\d+\.\s|!\[)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ type: 'p', text: text(para.join(' ')) });
  }
  return blocks;
}

const plain = (blocks: ArticleBlock[]) => blocks.filter((b): b is { type: 'p'; text: string } => b.type === 'p').map((b) => b.text);

export function articleBlocks(markdown: string, siteUrl: string | null): StructuredArticle {
  const origin = siteUrl ? siteUrl.replace(/\/+$/, '').replace(/^(https?:\/\/)www\./, '$1') : null;
  const normalised = origin ? markdown.replace(/(https?:\/\/)www\./g, '$1') : markdown;
  const lines = normalised.replace(/\r\n/g, '\n').split('\n');
  const h1At = lines.findIndex((l) => /^#\s+/.test(l));
  const heading = h1At >= 0 ? lines[h1At].replace(/^#\s+/, '').trim() : '';
  const chunks: { h: string; lines: string[] }[] = [{ h: '', lines: [] }];
  lines.forEach((l, idx) => {
    if (idx === h1At) return;
    const h = /^(#{2,3})\s+(.+)$/.exec(l);
    if (h) chunks.push({ h: h[2].trim(), lines: [] });
    else chunks[chunks.length - 1].lines.push(l);
  });

  const lead = blocksOf(chunks[0].lines, origin);
  let summary: StructuredArticle['summary'] = null;
  let keyPoints: string[] = [];
  const leadQuotes = chunks[0].lines.join('\n');
  const tldr = /^>\s*\[!tldr\][^\n]*\n((?:>.*\n?)*)/im.exec(leadQuotes);
  if (tldr) {
    const body = tldr[1].split('\n').map((l) => l.replace(/^>\s?/, '').trim()).filter(Boolean);
    summary = {
      text: localiseLinks(body.filter((l) => !/^[-*]\s/.test(l)).join(' '), origin),
      points: body.filter((l) => /^[-*]\s/.test(l)).map((l) => localiseLinks(l.replace(/^[-*]\s+/, ''), origin)),
    };
  }
  const key = /^>\s*\[!key\][^\n]*\n((?:>.*\n?)*)/im.exec(leadQuotes);
  if (key) keyPoints = key[1].split('\n').map((l) => l.replace(/^>\s?/, '').trim()).filter((l) => /^[-*]\s/.test(l)).map((l) => localiseLinks(l.replace(/^[-*]\s+/, ''), origin));

  const sections: StructuredArticle['sections'] = [];
  const faqs: StructuredArticle['faqs'] = [];
  let closing: StructuredArticle['closing'] = null;
  let inFaq = false;
  for (const chunk of chunks.slice(1)) {
    const blocks = blocksOf(chunk.lines, origin);
    if (isFaqHeading(chunk.h)) { inFaq = true; continue; }
    if (inFaq && /[?;]\s*$/.test(chunk.h)) { faqs.push({ q: chunk.h, a: plain(blocks).join(' ') }); continue; }
    inFaq = false;
    if (isConclusionHeading(chunk.h) || chunk === chunks[chunks.length - 1]) {
      const paragraphs = plain(blocks);
      closing = {
        h: chunk.h,
        paragraphs,
        links: paragraphs.flatMap((p) => [...p.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => ({ label: m[1], to: m[2] }))),
      };
      continue;
    }
    sections.push({ h: chunk.h, blocks });
  }

  return {
    heading,
    intro: plain(lead).join('\n\n'),
    summary,
    keyPoints,
    sections,
    faqs,
    closing,
  };
}
