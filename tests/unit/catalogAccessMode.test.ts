/** Who may read a published catalog — three modes, and every widening is a server decision. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Comments are prose, not behaviour — a guard that greps source must blank them first.
import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const EDGE = readFileSync(join(ROOT, 'supabase/functions/catalog-access/index.ts'), 'utf8');
const PAGE = readFileSync(join(ROOT, 'src/components/business/catalogs/PublicCatalogPage.tsx'), 'utf8');
const BUILDER = readFileSync(join(ROOT, 'src/modules/presentation-catalogs/pages/CatalogBuilderPage.tsx'), 'utf8');
const SERVICE = readFileSync(join(ROOT, 'src/services/catalogsService.ts'), 'utf8');

const EDGE_CODE = blankComments(EDGE);
const PAGE_CODE = blankComments(PAGE);
const BUILDER_CODE = blankComments(BUILDER);

const MODES = ['allowlist', 'any_email', 'open'];

describe('the three access modes are one vocabulary', () => {
  it('the service declares exactly these three', () => {
    const m = SERVICE.match(/export type CatalogAccessMode =([^;]+);/);
    expect(m, 'CatalogAccessMode is the TypeScript source of the three modes').toBeTruthy();
    for (const mode of MODES) expect(m![1]).toContain(`'${mode}'`);
  });

  it('the builder offers all three, each with its own wording', () => {
    for (const mode of MODES) expect(BUILDER_CODE).toContain(`id: '${mode}'`);
  });
});

describe('opening a catalog is a decision the SERVER makes', () => {
  /**
   * The absence of a token is not what makes `public_body` safe — re-reading `access_mode` off the
   * row is. A client asking for the open payload proves nothing about the catalog being open.
   */
  it('public_body re-checks the mode and 404s otherwise', () => {
    expect(EDGE_CODE).toContain("body.action === 'public_body'");
    expect(EDGE_CODE).toMatch(/access_mode !== 'open'[\s\S]{0,200}?404/);
  });

  it('public_body selects access_mode, so the check reads a real column', () => {
    const block = EDGE_CODE.slice(EDGE_CODE.indexOf("body.action === 'public_body'"));
    const head = block.slice(0, block.indexOf("body.action === 'request'"));
    expect(head).toContain('access_mode');
    // Same projection as the gated path: opening a catalog must never widen the FIELDS.
    expect(head).toContain('projectCatalogForViewer(');
  });

  it('an unpublished catalog is never served, whatever its mode', () => {
    const block = EDGE_CODE.slice(EDGE_CODE.indexOf("body.action === 'public_body'"));
    expect(block.slice(0, 900)).toContain("status !== 'published'");
  });

  /** A column patch from the client must not be able to widen access. */
  it('the client widens access through the RPC, never an update()', () => {
    expect(SERVICE).toContain("supabase.rpc('set_catalog_access_mode'");
    expect(SERVICE).not.toMatch(/update\([^)]*access_mode/);
    expect(BUILDER_CODE).toContain('catalogsService.setAccessMode(');
    expect(BUILDER_CODE).not.toMatch(/catalogsService\.update\([^)]*access_mode/);
  });
});

describe('the page asks the server what to draw', () => {
  it('reads the mode off the meta response rather than deciding locally', () => {
    expect(PAGE_CODE).toContain("data.access_mode === 'open'");
    expect(PAGE_CODE).toContain("action: 'public_body'");
  });

  /**
   * `allowlist` must stay the default at every layer. A catalog that silently became readable
   * because a new column defaulted the other way is the failure this whole feature can cause.
   */
  it('nothing defaults a missing mode to anything but allowlist', () => {
    for (const src of [EDGE_CODE, BUILDER_CODE]) {
      for (const m of src.matchAll(/access_mode\s*\?\?\s*'([a-z_]+)'/g)) {
        expect(m[1], 'a missing access_mode must fall back to the NARROWEST mode').toBe('allowlist');
      }
    }
  });
});

describe('any_email captures rather than refuses', () => {
  it('rescues only a DENIAL, so a known customer is still named', () => {
    // Overriding the whole verdict would file a CRM contact as an anonymous lead.
    expect(EDGE_CODE).toMatch(/!matched\.granted[\s\S]{0,120}?any_email/);
    expect(EDGE_CODE).toMatch(/kind:\s*'lead'/);
  });

  it('still runs the throttle — capture is not an invitation to sweep', () => {
    const req = EDGE_CODE.slice(EDGE_CODE.indexOf("body.action === 'request'"));
    const upTo = req.slice(0, req.indexOf('resolveEmailMatch'));
    expect(upTo).toContain('RL_MAX_FAILED_PER_IP');
  });
});
