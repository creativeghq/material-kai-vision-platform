/**
 * A presentation sheet's images are the sheet's own, and revoking the link revokes them (#392).
 *
 * THE DEFECT. A sheet's layout stored absolute URLs into `generation-images`, a PUBLIC bucket.
 * `share_expires_at` therefore expired the PDF and nothing else: whoever kept an image URL kept
 * the image, and anyone who learned a path could construct one. A client whose access "ended"
 * still held every render, every product photo and every plan the sheet showed.
 *
 * THE FIX has three halves and each one is silent on its own:
 *
 *   1. The sheet SNAPSHOTS its images into a private `sheet-assets/<sheet_id>/` at creation, and
 *      again after a save that adds one. Miss this and the layout still names the public copy.
 *   2. Reads RESOLVE `sheet-asset://` refs to signed URLs at the four service boundaries. Miss
 *      one and that surface renders nothing, with no error anywhere.
 *   3. The write boundary FOLDS THEM BACK. Miss this and the canvas persists the one-hour signed
 *      URL it was rendering — the sheet looks perfect all afternoon and is a page of dead images
 *      tomorrow, long after the save that broke it.
 *
 * Every one of the three is a wrong-but-valid string: a URL where a ref belongs typechecks, saves
 * and renders. So they are checked here rather than trusted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  SHEET_ASSET_BUCKET,
  SHEET_ASSET_SCHEME,
  collectSheetImages,
  isImageKey,
  isSheetAssetRef,
  mapSheetImages,
  sheetAssetPath,
} from '../../src/services/moodboards/sheetAssetRefs';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const SERVICE = 'src/services/moodboardSheetsService.ts';
const CREATE = 'supabase/functions/generate-moodboard-sheet-pdf/create-sheet.ts';
const LAYOUT = 'supabase/functions/generate-moodboard-sheet-pdf/layout.ts';
const HANDLER = 'supabase/functions/generate-moodboard-sheet-pdf/index.ts';
const SHARE = 'supabase/functions/moodboard-sheet-share/index.ts';

describe('#392 — the traversal both directions share', () => {
  it('finds an image under every shape a sheet payload uses', () => {
    // The real ones: a top-level hero, a nested cover, an array of layout items, a chip inside an
    // item. A walk that missed any of these would leave that image public and say nothing.
    const payload = {
      hero_image_url: 'https://a/1.png',
      cover: { cover_image_url: 'https://a/2.png' },
      layout: [
        { image_url: 'https://a/3.png', chips: [{ image_url: 'https://a/4.png' }] },
      ],
    };
    expect(collectSheetImages(payload).sort()).toEqual([
      'https://a/1.png', 'https://a/2.png', 'https://a/3.png', 'https://a/4.png',
    ]);
  });

  it('leaves values that are not images alone', () => {
    // A sheet carries links too. Copying a product page into the sheet's image folder would be
    // wrong, and rewriting it to a ref would break the link.
    const payload = { product_url: 'https://shop/x', source: 'https://a/1.png', note: 'https://a' };
    expect(collectSheetImages(payload)).toEqual([]);
    expect(isImageKey('image_url')).toBe(true);
    expect(isImageKey('hero_image_url')).toBe(true);
    expect(isImageKey('image_urls')).toBe(false);
    expect(isImageKey('url')).toBe(false);
  });

  it('round-trips a ref through a signed URL and back', () => {
    // This IS the canvas save path: resolve for rendering, edit, fold back, write. If the two
    // directions disagreed the write would persist an expiring URL.
    const ref = `${SHEET_ASSET_SCHEME}sheet-1/abc.png`;
    const signed = `https://p.supabase.co/storage/v1/object/sign/${SHEET_ASSET_BUCKET}/sheet-1/abc.png?token=xyz`;

    const rendered = mapSheetImages({ hero_image_url: ref }, () => signed) as Record<string, string>;
    expect(rendered.hero_image_url).toBe(signed);

    // The fold-back is structural (it reads the path out of the URL), so recover it the same way
    // the service does rather than from a remembered map.
    const folded = mapSheetImages(rendered, (v) => {
      const m = new RegExp(`/object/sign/${SHEET_ASSET_BUCKET}/([^?]+)`).exec(v);
      return m ? `${SHEET_ASSET_SCHEME}${m[1]}` : v;
    }) as Record<string, string>;
    expect(folded.hero_image_url).toBe(ref);
  });

  it('reads a ref and refuses everything else', () => {
    expect(sheetAssetPath(`${SHEET_ASSET_SCHEME}s/a.png`)).toBe('s/a.png');
    expect(sheetAssetPath('https://a/1.png')).toBeNull();
    expect(sheetAssetPath(null)).toBeNull();
    expect(isSheetAssetRef('sheet-asset:/s/a.png')).toBe(false);
  });
});

describe('#392 — the sheet owns its images', () => {
  it('creation snapshots them before it returns', () => {
    const create = src(CREATE);
    expect(create).toMatch(/snapshotSheetAssets\(/);
    expect(create, 'the rewritten payload is never stored').toMatch(/data: snapshot\.data/);
    expect(create, 'the caller is handed the pre-snapshot payload')
      .toMatch(/initial_data = snapshot\.data/);
  });

  it('a save that adds an image snapshots it too', () => {
    // A canvas can drag in a chip that still points at the public bucket. The client cannot copy
    // it itself — writes to the private bucket are service-role only, which is what stops one
    // person putting a file behind another sheet's share boundary.
    expect(src(HANDLER)).toMatch(/body\.action === 'snapshot_assets'/);
    expect(src(SERVICE)).toMatch(/action: 'snapshot_assets'/);
  });

  it('the snapshot action checks the caller owns the sheet, and 404s on a mismatch', () => {
    const handler = src(HANDLER);
    const block = handler.slice(handler.indexOf("body.action === 'snapshot_assets'"));
    const body = block.slice(0, block.indexOf('snapshotSheetAssets('));
    expect(body).toMatch(/created_by !== auth\.userId/);
    // 403 confirms the id exists, which is an enumeration oracle over other tenants' sheets.
    expect(body).toMatch(/'Sheet not found' \}, 404\)/);
    expect(body, 'a 403 leaks that the sheet exists').not.toMatch(/, 403\)/);
  });
});

describe('#392 — every boundary resolves, and the write folds back', () => {
  it('all four reads resolve', () => {
    const service = src(SERVICE);
    // list / get / createSheet / update — each hands a payload to a canvas or a card.
    expect((service.match(/resolveSheetAssets\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('the write folds signed URLs back into refs BEFORE the update', () => {
    const service = src(SERVICE);
    const update = service.slice(service.indexOf('async update(sheetId'));
    const fold = update.indexOf('toSheetAssetRefs(');
    const write = update.indexOf(".from('moodboard_presentation_sheets')");
    expect(fold, 'update() no longer folds the URLs back').toBeGreaterThan(-1);
    // Order, not presence: a fold after the write is not a fold.
    expect(fold).toBeLessThan(write);
  });

  it('no component reads sheet data straight from the table', () => {
    // Every client read of sheet DATA goes through list/get, which is the only reason ~30 render
    // sites needed no change. A component selecting the row itself would render raw refs.
    //
    // Selecting sheet rows is fine and common — the project index lists them by title and status.
    // What is not fine is pulling `data` (or `*`) outside the service, so the check is tied to
    // the SELECT that follows each read rather than to "this file mentions both somewhere".
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          if (rel.endsWith('moodboardSheetsService.ts')) continue;
          const text = stripComments(read(rel));
          for (const m of text.matchAll(/from\('moodboard_presentation_sheets'\)\s*([\s\S]{0,220})/g)) {
            const select = /\.select\(\s*'([^']*)'/.exec(m[1]);
            if (!select) continue;
            const columns = select[1].split(',').map((c) => c.trim());
            if (columns.includes('*') || columns.includes('data')) offenders.push(`${rel}: ${select[1]}`);
          }
        }
      }
    };
    walk('src');
    expect(offenders,
      'These read sheet data straight from the table, so `sheet-asset://` refs reach a render '
      + `site as text:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the PDF renderer resolves refs at its single fetch point', () => {
    // Eleven builders call fetchImageBytes. Resolving there is why none of them changed.
    const layout = src(LAYOUT);
    const fn = layout.slice(layout.indexOf('export async function fetchImageBytes'));
    expect(fn.slice(0, 400)).toMatch(/sheetAssetPath\(url\)/);
    expect(fn.slice(0, 900), 'it signs a URL instead of downloading it server-side')
      .toMatch(/from\(SHEET_ASSET_BUCKET\)\.download\(path\)/);
  });

  it('an anonymous share viewer gets a signed URL, not a ref', () => {
    // A token holder has no session, so there is no client-side signer for them. Minting it
    // against a token this function already checked is live IS the revocation story.
    const share = src(SHARE);
    expect(share).toMatch(/async function signSheetAsset/);
    expect(share).toMatch(/lightingImageUrl = await signSheetAsset\(/);
  });

  it('nothing builds a public URL for the private bucket', () => {
    // `getPublicUrl` on a private bucket returns a URL that 400s — a plausible string that
    // renders as a broken image, which is the failure this whole change exists to remove.
    const offenders: string[] = [];
    for (const file of [SERVICE, CREATE, LAYOUT, HANDLER, SHARE]) {
      const text = src(file);
      if (text.includes('getPublicUrl') && text.includes(SHEET_ASSET_BUCKET)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
