// GENERATED MIRROR of src/utils/emailMarkup.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

type Escape = (s: string) => string;

const MARKUP = /\*\*[^*\n]+\*\*|(^|[\s(])\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\((https?:\/\/|mailto:)[^)\s]+\)|^\s*([-*]|\d+\.|>)\s/m;

export function hasEmailMarkup(text: string | null | undefined): boolean {
  return !!text && MARKUP.test(text);
}

function inline(escaped: string): string {
  const links: string[] = [];
  let out = escaped.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_m, label: string, url: string) => {
    links.push(`<a href="${url}">${label}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_m, pre: string, url: string) => {
    links.push(`<a href="${url}">${url}</a>`);
    return `${pre}\u0000${links.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
}

export function renderEmailMarkup(text: string, escape: Escape): string {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.replace(/^\n+|\n+$/g, '')).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(escape(l.replace(/^\s*[-*]\s+/, '')))}</li>`).join('')}</ul>`;
    }
    if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(escape(l.replace(/^\s*\d+\.\s+/, '')))}</li>`).join('')}</ol>`;
    }
    if (lines.every((l) => /^\s*>/.test(l))) {
      return `<blockquote>${lines.map((l) => inline(escape(l.replace(/^\s*>\s?/, '')))).join('<br>')}</blockquote>`;
    }
    return `<p>${lines.map((l) => inline(escape(l))).join('<br>')}</p>`;
  }).join('\n');
}
