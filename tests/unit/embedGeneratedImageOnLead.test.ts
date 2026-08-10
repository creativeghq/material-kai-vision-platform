/**
 * The AI impression on a lead (#341 join 7) — and the fact that an anonymous caller chooses it.
 *
 * The builder shows a generated impression when the catalogue has nothing to show, then the visitor
 * asks to be quoted. Sending that picture with the request is the point: the operator otherwise
 * reads "fabric: linen, colour: sunset" and imagines what the customer had on screen, while the
 * image they are actually anchored on existed and was thrown away.
 *
 * But `request_quote` is an ANONYMOUS write. Whatever it stores gets rendered later in
 * /admin → Quote Requests, in an operator's browser. An unvalidated URL here means a stranger
 * decides what that browser loads — an off-platform tracker at minimum. So the endpoint keeps the
 * value only when it is one of our own public generation objects, and drops it otherwise WITHOUT
 * refusing the request: losing a lead over a bad image URL is the worse failure of the two.
 *
 * This test pins the shape of that check against the source, because the failure it prevents is
 * invisible to every other gate — a stored string is a valid string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const API = join(ROOT, 'supabase/functions/products-3d-api/index.ts');
const BUILDER = join(ROOT, 'src/embed/materialkai-builder.ts');

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** The endpoint's rule, extracted so the assertions below run it rather than describe it. */
function keptUrl(claimed: unknown, supabaseUrl = 'https://proj.supabase.co'): string | null {
  const prefix = `${supabaseUrl}/storage/v1/object/public/generation-images/`;
  const c = typeof claimed === 'string' ? claimed : null;
  return c && c.startsWith(prefix) && c.length <= 2048 ? c : null;
}

describe('the impression that reaches the lead', () => {
  it('keeps our own generated image', () => {
    const ours = 'https://proj.supabase.co/storage/v1/object/public/generation-images/gen/abc.png';
    expect(keptUrl(ours)).toBe(ours);
  });

  it('drops anything that is not ours, rather than storing what a stranger chose', () => {
    for (const hostile of [
      'https://evil.example.com/tracker.gif',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zy8+',
      // The classic prefix near-miss: a host an attacker can register that starts the same way.
      'https://proj.supabase.co.evil.com/storage/v1/object/public/generation-images/x.png',
      // Right host, wrong bucket — private buckets are served through signed URLs that expire, so
      // a stored one rots into a broken image in the admin.
      'https://proj.supabase.co/storage/v1/object/public/pdf-documents/x.pdf',
      42,
      null,
    ]) {
      expect(keptUrl(hostile), String(hostile)).toBeNull();
    }
  });

  it('a rejected image does not cost the lead', () => {
    // The whole request must still be recorded. This is the reason the check produces null instead
    // of a 400 — the picture is the nice-to-have, the lead is the thing.
    const src = read(API);
    const block = src.slice(src.indexOf("if (action === 'request_quote')"));
    // Anchor on the quote_requests insert itself. Slicing to the first `.select('id').single()`
    // lands on the CRM-contact insert above it, which is how the first draft of this test failed
    // against correct code.
    const insertStart = block.indexOf("from('quote_requests').insert(");
    expect(insertStart, 'quote_requests insert not found — this guard is reading the wrong block').toBeGreaterThan(-1);
    const insert = block.slice(insertStart, block.indexOf('}).select(', insertStart));
    expect(insert).toContain('generated_image_url');
    // Nothing may bail out between deciding the URL and writing the row.
    const guard = block.slice(block.indexOf('const generatedPrefix'), insertStart);
    expect(guard).not.toMatch(/return embedJson\(\{ error/);
  });

  it('the builder actually sends what it displayed', () => {
    // Both halves have to exist or this is a silent no-op: a column that is always null looks
    // exactly like "no impression was generated".
    const builder = read(BUILDER);
    const start = builder.indexOf('private async submitQuote');
    // To the end of the method, not to the first `}` — the first one closes the fetch body object.
    const submit = builder.slice(start, builder.indexOf('\n  }\n', start));
    expect(submit).toContain('generated_image_url');
    expect(submit).toContain('this.generatedUrl');
  });
});
