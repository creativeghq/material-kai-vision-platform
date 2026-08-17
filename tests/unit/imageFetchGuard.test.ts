/**
 * Guard: one guarded, bounded way to fetch an image from a URL (invariant 7).
 *
 * There were SIX implementations across the edge functions, at three strengths, and
 * the differences were invisible because every one of them returned plausible bytes:
 *
 *   _shared/pdf/branding.ts        no guard · redirect:'follow' · cap AFTER arrayBuffer
 *   generate-quote-pdf/data-…      byte-identical twin of that one
 *   generate-moodboard-…/layout    no guard · follows redirects · no cap
 *   generate-virtual-staging       no guard · follows redirects · no cap
 *   generate-region-edit           guarded  · redirect:'error'  · no cap
 *   generate-interior-gemini       guarded  · redirect:'error'  · no cap
 *
 * The first four are the reachable end of audit #352 `A8` — `image_url` on a catalog
 * material is model-supplied, and `redirect: 'follow'` means a public URL can 302 to
 * 169.254.169.254 and be followed. The last two were guarded and still unbounded.
 *
 * The audit named one of these. The `generate-quote-pdf` twin was found by the sweep
 * at the bottom of this file on its first run, which is the argument for the sweep:
 * a list of known sites is a list of the sites somebody already looked at.
 *
 * A seventh implementation lives in the other repo (mivaa-pdf-extractor
 * image_download_service.py) and was fixed there. A new runtime gets a new CALLER of
 * the shared helper, never a new copy — the same rule invariant 11 applies to
 * escapeHtml, for the same reason: copies drift to different strengths.
 *
 * Static, over source text. A runtime test would need a live DNS resolver and a server
 * willing to send more bytes than it admits to, so this pins the SHAPE: that the call
 * sites delegate, and that the helper still does the three things that matter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const FUNCS = join(ROOT, 'supabase', 'functions');
const HELPER = join(FUNCS, '_shared', 'fetch-image.ts');

const read = (p: string) => readFileSync(p, 'utf8');

/** Source with comments stripped, so prose describing the old bug is not read as code. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('the shared image fetch helper', () => {
  it('validates the URL, refuses redirects, and bounds the read', () => {
    const src = codeOnly(read(HELPER));

    expect(src, 'the helper no longer runs the URL through the shared SSRF guard')
      .toContain('assertSafeUrl');

    expect(src, "redirects are followed again — a checked host can 302 to one nothing checked")
      .toContain("redirect: 'error'");

    // The cap must be applied while STREAMING. `await res.arrayBuffer()` as the primary
    // read path is the defect: a cap consulted after the bytes are already in memory is
    // not a cap, which is exactly how MIVAA's copy failed.
    expect(src, 'the size cap is no longer enforced against the bytes actually delivered')
      .toMatch(/getReader\(\)/);
    expect(src, 'the streaming read no longer aborts when the cap is passed')
      .toMatch(/total\s*>\s*maxBytes/);
  });

  it('defaults to https only', () => {
    const src = codeOnly(read(HELPER));
    expect(src, "http:// is permitted by default again").toMatch(/allowSchemes\s*\?\?\s*\['https:'\]/);
  });

  // Same machinery, image content-type rule off — for the provider-output VIDEO downloads. They
  // were each hand-rolling `fetch(url).arrayBuffer()`, which is how a redirect or an HTML error
  // page ended up in the bucket as an mp4 and was handed to the user as their finished video
  // (#364 EX-7). A second copy is a second strength, which is the whole reason this file exists.
  it('exposes the non-image variant off the same guard', () => {
    const src = codeOnly(read(HELPER));
    expect(src, 'fetchBinaryGuarded is gone — the video downloads have nothing to delegate to')
      .toMatch(/export async function fetchBinaryGuarded/);
    const bin = src.slice(src.indexOf('export async function fetchBinaryGuarded'));
    expect(bin, 'the binary variant no longer validates the URL').toContain('assertSafeUrl');
    expect(bin, 'the binary variant follows redirects again').toContain("redirect: 'error'");
    expect(bin, 'the binary variant no longer bounds the read').toContain('readCapped');
    // The image helper must be built ON the binary one, not beside it.
    const img = src.slice(src.indexOf('export async function fetchImageGuarded'));
    expect(img.slice(0, img.indexOf('\n}')), 'fetchImageGuarded stopped delegating and forked again')
      .toContain('fetchBinaryGuarded');
  });
});

describe('every server-side image fetch goes through it', () => {
  // Each of the six, and what it must delegate to.
  const CALL_SITES: Array<[string, string]> = [
    ['_shared/pdf/branding.ts', 'fetchImageGuardedOrNull'],
    ['generate-quote-pdf/data-fetcher.ts', 'fetchImageGuardedOrNull'],  // found by the sweep
    ['generate-moodboard-sheet-pdf/layout.ts', 'fetchImageGuardedOrNull'],
    ['generate-virtual-staging/index.ts', 'fetchImageGuarded'],
    ['generate-region-edit/index.ts', 'fetchImageGuarded'],
    ['generate-interior-gemini/index.ts', 'fetchImageGuarded'],
  ];

  it.each(CALL_SITES)('%s delegates to %s', (rel, fn) => {
    const src = codeOnly(read(join(FUNCS, rel)));
    expect(src, `${rel} no longer uses the shared helper`).toContain(fn);
    expect(src, `${rel} fetches with redirects followed again`)
      .not.toMatch(/redirect:\s*'follow'/);
  });

  it('no edge function hand-rolls an unguarded image fetch', () => {
    // A raw `await res.arrayBuffer()` on a fetch of an *image url* is the shape. We
    // cannot type-check intent, so this looks for the two spellings that produced the
    // copies: a function named like an image fetcher that calls fetch() directly.
    const offenders: string[] = [];
    for (const file of walk(FUNCS)) {
      if (file === HELPER) continue;
      const src = codeOnly(read(file));
      const declares = /(?:async function|const)\s+(fetchImage\w*|fetchImageBuffer|fetchImageBytes\w*)\b/.exec(src);
      if (!declares) continue;
      // A declaration is fine as long as its body delegates rather than fetching.
      if (/\bfetchImageGuarded(OrNull)?\b/.test(src)) continue;
      if (/\bfetch\s*\(/.test(src)) {
        offenders.push(`${file.replace(ROOT, '').replace(/\\/g, '/')} declares ${declares[1]} and calls fetch() itself`);
      }
    }
    expect(
      offenders,
      'another image-fetch implementation appeared. Import fetchImageGuarded from ' +
        '_shared/fetch-image.ts instead — six copies at three strengths is the ' +
        'defect this guard exists to stop:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  // The sweep above keys on the function's NAME, and that is exactly how the eighth site
  // survived it: `generate-purchase-sheet-pdf` called its copy `fetchBytes`, so a test looking
  // for `fetchImage*` reported the codebase clean while a raw, redirect-following, uncapped
  // `fetch(it.design_image_url)` sat in it (#361 `EG-18`). A list of the names somebody already
  // thought of is not coverage.
  //
  // So this one keys on where the URL CAME FROM instead. `fetch(mivaaUrl)` is this runtime
  // calling a service it chose; `fetch(item.design_image_url)` is this runtime resolving a host
  // out of a database row that a model, a supplier feed or a user put there. Only the second is
  // invariant 7, and a property access ending in url/href/src is what distinguishes them.
  it('no edge function fetches a stored URL field directly', () => {
    // `x.image_url`, `row.design_image_url`, `c.href`, `p.src` — but not a local `mivaaUrl`.
    const STORED_URL_FIELD = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.(?:\w*_)?(?:url|uri|href|src)$/i;
    const offenders: string[] = [];

    for (const file of walk(FUNCS)) {
      if (file === HELPER) continue;
      const src = codeOnly(read(file));
      // The file already delegates or guards — nothing to prove.
      if (/\bfetchImageGuarded(OrNull)?\b|\bfetchBinaryGuarded\b|\bassertSafeUrl\b/.test(src)) continue;

      const re = /\bfetch\s*\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (!STORED_URL_FIELD.test(m[1])) continue;
        offenders.push(`${file.replace(ROOT, '').replace(/\\/g, '/')}: fetch(${m[1]})`);
      }
    }

    const unique = [...new Set(offenders)];
    expect(
      unique,
      'a stored URL is being fetched server-side with no SSRF guard. The host comes out of a ' +
        'row, so it is chosen by whoever wrote the row. Use fetchImageGuarded / ' +
        'fetchBinaryGuarded from _shared/fetch-image.ts:\n  ' + unique.join('\n  '),
    ).toEqual([]);
  });
});
