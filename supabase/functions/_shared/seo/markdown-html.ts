/** Article markdown → HTML for a CMS. Every text fragment goes through escapeHtml (invariant 11). */
import { escapeHtml } from '../html.ts';
import { findFaqSection, isQuestionHeading } from './articleSections.generated.ts';

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;
const SAFE_SRC = /^https:\/\//i;

export function inlineMarkdown(text: string): string {
  const re = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])/g;
  let out = '';
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[3] !== undefined) {
      const [, bang, label, url, title] = m;
      if (bang) {
        out += SAFE_SRC.test(url)
          ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy">`
          : escapeHtml(label);
      } else {
        out += SAFE_HREF.test(url) ? `<a href="${escapeHtml(url)}">${inlineMarkdown(label)}</a>` : inlineMarkdown(label);
      }
    } else if (m[5] !== undefined) {
      out += `<code>${escapeHtml(m[5])}</code>`;
    } else if ((m[6] ?? m[7]) !== undefined) {
      out += `<strong>${inlineMarkdown(m[6] ?? m[7])}</strong>`;
    } else {
      out += `<em>${inlineMarkdown(m[8] ?? m[9])}</em>`;
    }
    last = re.lastIndex;
  }
  return out + escapeHtml(text.slice(last));
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isTableRule = (row: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(row);

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inlineMarkdown(para.join(' '))}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); continue; }

    if (t.startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(t);
    if (h) { flush(); out.push(`<h${h[1].length}>${inlineMarkdown(h[2])}</h${h[1].length}>`); continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) { flush(); out.push('<hr>'); continue; }

    if (t.startsWith('>')) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith('>'); i++) quote.push(lines[i].trim().replace(/^>\s?/, ''));
      i--;
      out.push(`<blockquote>${markdownToHtml(quote.join('\n'))}</blockquote>`);
      continue;
    }

    const list = /^([-*+]|\d+[.)])\s+/.exec(t);
    if (list) {
      flush();
      const ordered = /\d/.test(list[1]);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[1]) === ordered) items.push(m[2]);
        else if (lines[i].trim() && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      i--;
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inlineMarkdown(x)}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (t.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flush();
      const head = cells(t);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
      i--;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMarkdown(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }

    para.push(t);
  }
  flush();
  return out.join('\n');
}

/** Question/answer pairs under the article's FAQ heading, for FAQPage structured data. */
export function faqPairs(markdown: string): Array<{ question: string; answer: string }> {
  const text = markdown.replace(/\r\n?/g, '\n');
  const faq = findFaqSection(text);
  if (!faq) return [];
  const lines = text.split('\n').slice(faq.headingLine + 1, faq.endLine);
  const pairs: Array<{ question: string; answer: string }> = [];
  let current: { question: string; answer: string[] } | null = null;
  for (const line of lines) {
    const h = /^#{3,6}\s+(.*?)\s*#*$/.exec(line.trim());
    const bold = /^\*\*(.+?)\*\*\s*$/.exec(line.trim());
    const q = h?.[1] ?? (bold && isQuestionHeading(bold[1]) ? bold[1] : null);
    if (q) {
      if (current?.answer.length) pairs.push({ question: current.question, answer: current.answer.join(' ') });
      current = { question: q, answer: [] };
    } else if (current && line.trim()) {
      current.answer.push(line.trim().replace(/[*_`]/g, ''));
    }
  }
  if (current?.answer.length) pairs.push({ question: current.question, answer: current.answer.join(' ') });
  return pairs;
}

/** JSON-LD as a script element; `<` is escaped so the payload cannot close the tag. */
export function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
