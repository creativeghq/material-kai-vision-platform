/** A form's Save button is content-sized and right-aligned, never stretched across the panel. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function tagEnd(s: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

describe('button sizing', () => {
  it('no Save button is full-width', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const src = blankComments(readFileSync(f, 'utf8'));
      let i = 0;
      while ((i = src.indexOf('<Button', i)) !== -1) {
        if (!/[\s>]/.test(src[i + 7] ?? '')) {
          i += 7;
          continue;
        }
        const end = tagEnd(src, i + 7);
        if (end < 0) break;
        const open = src.slice(i, end + 1).replace(/\s+/g, ' ');
        const close = src.indexOf('</Button>', end);
        const label = close < 0 ? '' : src.slice(end + 1, close);
        const cls = open.match(/className=("[^"]*"|\{.*?\}(?= \w+=| ?\/?>))/)?.[1] ?? '';
        if (/\bw-full\b/.test(cls) && !/\bsm:w-auto\b/.test(cls) && /\bSave\b/.test(label)) {
          offenders.push(`${relative(ROOT, f).split('\\').join('/')}:${src.slice(0, i).split('\n').length}`);
        }
        i = end;
      }
    }
    expect(
      offenders,
      'A Save button stretched across a panel reads as a banner, not an action. Drop w-full and ' +
        'wrap it in <div className="flex justify-end">.',
    ).toEqual([]);
  });
});
