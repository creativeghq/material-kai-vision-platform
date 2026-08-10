/**
 * Embed analytics vocabulary — three places, one list.
 *
 * An event type has to appear in all three or it silently reads as zero, and WHICH zero depends on
 * which one you miss:
 *
 *   1. the widget emits it            (`src/embed/materialkai-product.ts`)
 *   2. the endpoint allows it         (`EMBED_EVENT_TYPES` in products-3d-api)
 *   3. the dashboard displays it      (`EMBED_EVENT_LABELS` in EmbedKeysCard)
 *
 * Miss (2) and the beacon is refused with a 400 — which the beacon swallows by design, so the
 * merchant sees a metric that never moves. Miss (3) and the rows are written correctly and shown to
 * nobody. Both look exactly like "nobody used that feature", which is the most expensive kind of
 * wrong: it reads as a product answer rather than a bug.
 *
 * This is not hypothetical on this surface. `action=event` once 400'd on 100% of calls because the
 * beacon posts with an empty body and the handler called `req.json()`, and it was invisible for the
 * same reason — the beacon swallows its own errors. `embed_configure` then sat on #258's list,
 * emitted by nothing and displayed by nothing, until #341.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/** `EMBED_EVENT_TYPES = [...]` in the edge function. */
function allowedTypes(): string[] {
  const src = read('supabase/functions/products-3d-api/index.ts');
  const start = src.indexOf('const EMBED_EVENT_TYPES');
  expect(start, 'EMBED_EVENT_TYPES not found').toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf('];', start));
  return [...block.matchAll(/'(embed_[a-z_]+)'/g)].map((m) => m[1]);
}

/** `EMBED_EVENT_LABELS = [...]` in the dashboard card. */
function labelledTypes(): string[] {
  const src = read('src/components/core/Profile/EmbedKeysCard.tsx');
  const start = src.indexOf('const EMBED_EVENT_LABELS');
  expect(start, 'EMBED_EVENT_LABELS not found').toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf('];', start));
  return [...block.matchAll(/\['(embed_[a-z_]+)'/g)].map((m) => m[1]);
}

/** Every `this.track('…')` the widget actually calls. */
function emittedTypes(): string[] {
  const src = read('src/embed/materialkai-product.ts');
  return [...new Set([...src.matchAll(/this\.track\('(embed_[a-z_]+)'\)/g)].map((m) => m[1]))];
}

describe('embed analytics vocabulary', () => {
  it('parses all three lists (a vacuous pass would report the codebase clean)', () => {
    expect(allowedTypes().length).toBeGreaterThan(3);
    expect(labelledTypes().length).toBeGreaterThan(3);
    expect(emittedTypes().length).toBeGreaterThan(3);
  });

  it('everything the widget emits is accepted by the endpoint', () => {
    const refused = emittedTypes().filter((t) => !allowedTypes().includes(t)).sort();
    expect(
      refused,
      `The widget emits event type(s) the endpoint refuses with a 400 the beacon swallows, so they ` +
        `read as zero forever: ${refused.join(', ')}. Add them to EMBED_EVENT_TYPES.`,
    ).toEqual([]);
  });

  it('everything the endpoint accepts is displayed somewhere', () => {
    const invisible = allowedTypes().filter((t) => !labelledTypes().includes(t)).sort();
    expect(
      invisible,
      `Event type(s) stored and shown to nobody — written correctly, invisible to the merchant: ` +
        `${invisible.join(', ')}. Add them to EMBED_EVENT_LABELS.`,
    ).toEqual([]);
  });

  it('nothing is displayed that nothing can emit', () => {
    // The reverse rot: a label for an event no longer produced shows a permanent 0 next to real
    // numbers, which reads as "nobody uses AR" rather than "nothing reports it".
    const orphaned = labelledTypes().filter((t) => !emittedTypes().includes(t)).sort();
    expect(
      orphaned,
      `Dashboard label(s) for event type(s) the widget never emits — a permanent zero that reads ` +
        `as a product answer: ${orphaned.join(', ')}.`,
    ).toEqual([]);
  });
});
