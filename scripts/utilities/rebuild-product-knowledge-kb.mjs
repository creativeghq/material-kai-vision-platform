/**
 * Definitive rebuild of the product-knowledge corpus from the split_v2 export.
 *
 * ── Why this file is committed ────────────────────────────────────────────────
 * The corpus that reached kb_docs on 2026-08-26 is the OUTPUT of this script, and
 * the boundaries below are ~200 lines of judgement that cannot be re-derived from
 * the export: `product-knowledge_split_v2.zip` is a Notion export that was cut at
 * every `##` heading, so it contains 673 fragments and NO record of where one
 * document ended and the next began. Re-running an import without this file would
 * reproduce the 673-entry knowledge base it replaced.
 *
 * Usage:
 *   unzip product-knowledge_split_v2.zip -d <dir>/kb
 *   node scripts/utilities/rebuild-product-knowledge-kb.mjs     # writes merged3.json
 * then diff merged3.json against kb_docs by slug + content hash and apply only the
 * delta — a full re-import re-chunks ~9,800 rows and bursts the embedding path.
 *
 * Three corrections over the first attempt, all of them load-bearing:
 *
 *  1. NO DROPPING BY TITLE. Pass 1 dropped runs 179-196 and four Product Bible
 *     fragments because their titles repeated. Measured afterwards, those runs
 *     share only 8-29% of their paragraphs with the copy that was kept — same
 *     section headings, different articles. Dropping them destroyed 174 unique
 *     paragraphs. A document is only dropped when its content is genuinely
 *     contained in another (see TRUE_DUPLICATES), and that is decided by
 *     paragraph overlap, never by name.
 *  2. UNWELD. Content the exporter wrote with `#` was never cut, so it stayed
 *     glued to the preceding `##` fragment. Two shapes: a trailing title that
 *     belongs to the NEXT document (MOVE_TO_NEXT), and a whole separate article
 *     sitting inside an unrelated one (NEW_DOCUMENT).
 *  3. Same-named but genuinely different articles get an explicit
 *     "(alternate version)" suffix rather than colliding in the UI.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = import.meta.dirname;
const ROOT = path.join(DIR, 'kb');
const SECTIONS = ['01-product', '02-product-bible', '03-product-ai', '04-product-marketing'];
const LABEL = {
  '01-product': 'Product', '02-product-bible': 'Product Bible',
  '03-product-ai': 'Product AI', '04-product-marketing': 'Product Marketing',
};

// seq that starts a document -> explicit title (null = use the fragment's own heading)
const BOUNDARIES = {
  '01-product': {
    1: 'Audits & Workshops', 4: null, 5: 'Process Artifacts',
    14: 'Portfolio Workflow Framework', 24: null, 25: 'Scrum and Kanban in Product Development',
    38: 'Software Delivery Framework', 44: 'Market & Competitor Analysis', 50: null,
    51: 'Adjacency', 54: 'Product Business Case Template',
    75: 'Product Prioritization Frameworks', 89: null, 90: 'Product Strategy Template',
    118: 'Product Vision Elements', 121: 'Initiative Assessment Questions',
    161: 'RICE Scoring', 165: 'Go-to-Market Strategy Guide',
    // Restored: same section headings as 75-88 / 161-164 but a different article
    // (measured 25% / 8% paragraph overlap). Note the two copies are structured
    // differently and the boundaries must follow that, not symmetry: in the kept
    // copy the RICE detail (161-164) shares 0% with the frameworks guide, so it is
    // its own document; in this copy the RICE detail (193-196) is 79% contained in
    // the guide, so 179-196 is ONE document.
    179: 'Product Prioritization Frameworks (alternate version)',
    197: 'Product Metrics Catalog', 211: 'Competitive Intelligence Program',
    215: 'Team Strategy One-Pager', 223: 'Product Strategy', 229: 'Product Vision',
    236: null, 237: 'White Hot Center', 244: 'Wardley Maps', 247: 'Biases',
    259: 'Post-Launch Playbook', 274: null, 275: 'How we make Hard Decisions',
    287: 'What we do as Product Managers', 290: 'What does a product manager do?',
    301: 'Building Product Strategy', 305: 'Product Lessons',
    307: 'Product Hiring Process', 310: 'How we use Circles to answer creative questions',
    318: 'First Principles Thinking', 324: null, 325: 'The Product-Manager Archetype',
    343: 'Product Spec Template', 356: null,
  },
  '02-product-bible': {
    1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 9: null,
    10: null, 11: null, 12: 'Opportunity Solution Trees',
    32: null, 33: null, 34: null, 35: null, 36: null, 37: null, 38: null, 39: null,
    40: null, 41: null, 42: 'Product Category', 44: null, 45: null, 46: null,
    47: 'Product Competitor Research and Strategy', 52: null, 53: null,
    54: 'Product Customer Journey', 55: 'Product Customer Journey (alternate version)',
    56: null, 57: null, 58: null, 59: 'Product Discovery', 61: null, 62: null, 63: null,
    64: null, 65: null, 66: null, 67: null, 68: 'Product GTM Strategy',
    104: null, 105: null, 106: null, 107: null, 108: null,
    109: 'Product Insights & Messaging', 112: null, 113: null,
    114: 'Product Jobs to be done', 128: null, 129: null, 130: null, 131: null,
    132: null, 133: null, 134: null, 135: null, 136: null, 137: null, 138: null,
    139: null, 140: null, 141: null, 142: null, 143: null,
    144: 'Product Opportunity Hypothesis',
    145: 'Product Opportunity Hypothesis (alternate version)',
    146: null, 147: null, 148: null, 149: 'Product Personas',
    165: null, 166: null, 167: null, 168: null, 169: null,
    170: 'Product Release', 171: 'Product Release (alternate version)',
    172: null, 173: null, 174: null,
    175: 'Product Specification, Brief & Requirement', 194: null, 195: null, 196: null,
    197: 'Product Team Efforts Alignment Framework', 203: null, 204: null, 205: null,
    206: null, 207: 'Product Value Concept Plan',
    208: 'Product Value Concept Plan (alternate version)',
    209: 'Product Year Review', 213: '[WIP] Product Intent',
  },
  '03-product-ai': {
    1: '4D Building AI Products', 8: 'AI Distribution', 19: 'AI Pricing',
    33: 'Prompt Optimization', 45: 'Rules of Building AI Products',
    56: 'The AI PM as Modern Product Leader',
  },
  '04-product-marketing': {
    1: 'Product Marketing', 2: null, 3: 'Product Marketing Framework', 10: null,
    11: null, 12: 'The Post-Launch Playbook',
  },
};

// Measured, not assumed: 100% of this document's paragraphs are inside the twin.
const TRUE_DUPLICATES = new Set(['Product::Post-Launch Playbook']);

const MOVE_TO_NEXT = {
  '01-product/013-engineering-l1s.md': 'Processes',
  '01-product/053-selecting-the-best-option.md': 'PRODUCT BUSINESS CASE TEMPLATE',
  '01-product/164-effort.md': 'Go-to-Market (GTM) Strategy',
  '01-product/178-14-workshop-activities.md': 'Product Prioritization Frameworks',
  '01-product/243-checklist-applying-the-framework.md': 'Wardley Mapping',
};

const NEW_DOCUMENT = {
  '01-product/050-abmabs.md': { at: 'Product-Led Growth Flywheel', title: 'Product-Led Growth Flywheel' },
  '01-product/214-always-cuddle-with-the-chaos.md': { at: 'The Product Strategy Definition', title: 'The Product Strategy Definition' },
  '01-product/222-further-reading.md': { at: 'Vision vs. Strategy', title: 'Vision vs. Strategy' },
  '01-product/049-market-trends.md': { at: 'Importance of a Decision', title: 'Importance of a Decision — Framework' },
  '01-product/027-definition-of-ready-and-definition-of-done.md': { at: 'OKRs in Product Management', title: 'OKRs in Product Management' },
};

const strip = (s) => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

function cutAt(body, at) {
  const lines = body.split('\n');
  const want = strip(at).toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('# ')) continue;
    if (strip(lines[i].replace(/^#\s*/, '')).toLowerCase().startsWith(want)) {
      return [lines.slice(0, i).join('\n').replace(/\s+$/, ''), lines.slice(i).join('\n').trim()];
    }
  }
  throw new Error(`cut point not found in ${at}`);
}

function loadFragments(sec) {
  return fs.readdirSync(path.join(ROOT, sec)).filter((f) => /^\d{3}-/.test(f)).sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(ROOT, sec, f), 'utf8');
      const lines = raw.split('\n');
      const h2i = lines.findIndex((l) => l.startsWith('## '));
      return {
        seq: parseInt(f.slice(0, 3), 10), rel: `${sec}/${f}`,
        title: strip(lines[h2i].replace(/^##\s*/, '')),
        body: lines.slice(h2i + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, ''),
      };
    });
}

const docs = [];
const extras = [];

for (const sec of SECTIONS) {
  const frags = loadFragments(sec);
  const starts = Object.keys(BOUNDARIES[sec]).map(Number).sort((a, b) => a - b);
  let carry = null;

  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] - 1 : Infinity;
    const group = frags.filter((f) => f.seq >= from && f.seq <= to);
    if (!group.length) continue;

    const title = strip(BOUNDARIES[sec][from] || group[0].title);
    const parts = [];
    if (carry) { parts.push(carry, ''); carry = null; }

    for (const [idx, f] of group.entries()) {
      let body = f.body;
      if (MOVE_TO_NEXT[f.rel]) { const [h, t] = cutAt(body, MOVE_TO_NEXT[f.rel]); body = h; carry = t; }
      if (NEW_DOCUMENT[f.rel]) {
        const [h, t] = cutAt(body, NEW_DOCUMENT[f.rel].at);
        body = h;
        extras.push({
          section: sec, section_label: LABEL[sec], title: NEW_DOCUMENT[f.rel].title,
          fragment_count: 1, source_paths: [f.rel], unwelded_from: title,
          content: `# ${NEW_DOCUMENT[f.rel].title}\n\n${t.replace(/^#[^\n]*\n+/, '')}\n`,
        });
      }
      const isLead = idx === 0 && f.title.toLowerCase() === title.toLowerCase();
      if (!isLead) parts.push(`## ${f.title}`, '');
      if (body.trim()) parts.push(body, '');
    }

    const content = `# ${title}\n\n` + parts.join('\n').replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
    if (content.length <= 200) continue;                       // nav stub
    if (TRUE_DUPLICATES.has(`${LABEL[sec]}::${title}`)) continue;
    docs.push({
      section: sec, section_label: LABEL[sec], title,
      fragment_count: group.length, source_paths: group.map((f) => f.rel), content,
    });
  }
}

for (const e of extras) {
  const at = docs.findIndex((d) => d.title === e.unwelded_from);
  docs.splice(at < 0 ? docs.length : at + 1, 0, e);
}

fs.writeFileSync(path.join(DIR, 'merged3.json'), JSON.stringify(docs, null, 2));
const bySec = {};
for (const d of docs) bySec[d.section_label] = (bySec[d.section_label] ?? 0) + 1;
console.log('documents:', docs.length);
console.table(Object.entries(bySec).map(([s, n]) => ({ section: s, documents: n })));
console.log('unwelded into their own document:', extras.length);
console.log('dropped as a measured true duplicate:', TRUE_DUPLICATES.size);
console.log('total content:', (docs.reduce((a, d) => a + d.content.length, 0) / 1e6).toFixed(2), 'MB');
