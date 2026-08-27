/**
 * Split the two collection documents into one page per entry.
 *
 * "Biases" and "Thinking" are catalogues, not articles: each holds an index list
 * followed by 48 biases / 22 mental models, every one of them a self-contained
 * entry with its own examples and takeaways. As single documents they are
 * unreadable and retrieval returns "Biases › Biases" for every question.
 *
 * Entry boundaries are `### Name` in both files. That heading level is ALSO used
 * for subsections, so the split list is taken from each document's own index (the
 * bullet list in its intro) rather than from the heading level alone — otherwise
 * "No-brainer" and "Big choice", which are options INSIDE "Hard choice model",
 * become top-level pages.
 *
 * Heading levels inside an entry are repaired on the way out. The exporter wrote
 * subsections as `# **How to use it**` — an H1 nested under nothing — so each page
 * would otherwise carry several H1s competing with its own title.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const ROOT = path.join(DIR, 'kb');

const SOURCES = [
  {
    parentTitle: 'Biases',
    parentSlug: 'product-biases',
    categoryName: 'Biases',
    file: '01-product/247-biases.md',
    // the last entry's body continues into these separate ## fragments
    tailFragments: [
      '248-what-is-the-mere-exposure-effect.md', '249-where-this-bias-occurs.md',
      '250-individual-effects.md', '251-systemic-effects.md', '252-why-it-happens.md',
      '253-why-it-is-important.md', '254-how-to-avoid-it.md', '255-how-it-all-started.md',
      '256-example-1---finance-and-domestic-investment.md',
      '257-example-2---journal-ranking-in-academia.md', '258-summary.md',
    ].map((f) => `01-product/${f}`),
  },
  {
    parentTitle: 'Thinking',
    parentSlug: 'product-thinking',
    categoryName: 'Thinking Models',
    file: '01-product/356-thinking.md',
    tailFragments: [],
  },
  {
    // Four unrelated pieces under one heading — a reading list, an essay on
    // running the company as a product, a description of what good PMs do, and a
    // manifesto. Only four entries, so they stay in the Product category rather
    // than earning one of their own; `categoryName: null` means "same as parent".
    parentTitle: 'Product Managers',
    parentSlug: 'product-product-managers',
    categoryName: null,
    file: '01-product/274-product-managers.md',
    tailFragments: [],
  },
];

const strip = (s) => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

function read(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = raw.split('\n');
  const h2i = lines.findIndex((l) => l.startsWith('## '));
  return { lines, h2i, body: lines.slice(h2i + 1) };
}

/** Pull the entry names out of the intro bullet list that precedes the first `### `. */
function indexNames(body) {
  const out = [];
  for (const l of body) {
    if (l.startsWith('### ')) break;
    const m = l.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (m) out.push(strip(m[1]));
  }
  return out;
}

/** Repair heading depth so the entry sits under a single H1. */
function fixHeadings(lines) {
  return lines.map((l) => {
    if (/^# \*\*/.test(l) || /^# .*\*\*$/.test(l)) return `## ${strip(l.replace(/^#\s*/, ''))}`;
    if (/^### \*\*/.test(l)) return `## ${strip(l.replace(/^###\s*/, ''))}`;
    if (/^# /.test(l)) return `## ${strip(l.replace(/^#\s*/, ''))}`;
    return l;
  });
}

const pages = [];
const parents = [];

for (const src of SOURCES) {
  const { body } = read(src.file);
  const names = indexNames(body);
  const nameSet = new Set(names.map((n) => n.toLowerCase()));

  // every `### ` line, flagged with whether the index says it is a top-level entry
  const marks = [];
  body.forEach((l, i) => {
    if (!l.startsWith('### ')) return;
    const name = strip(l.replace(/^###\s*/, ''));
    if (nameSet.has(name.toLowerCase())) marks.push({ i, name });
  });

  if (!marks.length) throw new Error(`no entries matched the index in ${src.file}`);

  const intro = body.slice(0, marks[0].i).join('\n').trim();
  parents.push({ ...src, intro, childCount: marks.length, names: marks.map((m) => m.name) });

  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].i : body.length;
    let entry = fixHeadings(body.slice(m.i + 1, end));

    // the final entry of Biases continues in its own ## fragments
    if (k === marks.length - 1 && src.tailFragments.length) {
      for (const rel of src.tailFragments) {
        const f = read(rel);
        const heading = strip(f.lines[f.h2i].replace(/^##\s*/, ''));
        entry = entry.concat(['', `## ${heading}`, '', ...fixHeadings(f.body)]);
      }
    }

    pages.push({
      collection: src.parentTitle,
      categoryName: src.categoryName,
      title: m.name,
      content: `# ${m.name}\n\n${entry.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()}\n`,
      source_paths: [src.file, ...(k === marks.length - 1 ? src.tailFragments : [])],
    });
  });
}

fs.writeFileSync(path.join(DIR, 'collection-pages.json'), JSON.stringify({ pages, parents }, null, 2));

for (const p of parents) {
  console.log(`${p.parentTitle}: ${p.childCount} entries -> "${p.categoryName}" category`);
}
console.log(`\ntotal new pages: ${pages.length}`);
const small = pages.filter((p) => p.content.length < 400);
console.log(`pages under 400 chars: ${small.length}${small.length ? ' -> ' + small.map((p) => p.title).join(', ') : ''}`);
console.log(`largest: ${pages.slice().sort((a, b) => b.content.length - a.content.length).slice(0, 3).map((p) => `${p.title} (${p.content.length})`).join(' | ')}`);
console.log(`smallest: ${pages.slice().sort((a, b) => a.content.length - b.content.length).slice(0, 3).map((p) => `${p.title} (${p.content.length})`).join(' | ')}`);
