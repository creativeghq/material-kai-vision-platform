/**
 * The workspace brand profile fills what a brief leaves out — and never more than that.
 *
 * ContentBrief has always declared brandVoice / provenance / firsthandExperience and the analyzer
 * has always scored them. Nothing filled them, so `provenance` and `firsthand_experience` failed
 * on every article and read as a writing problem. Confirmed on the one live article: score 61,
 * both among its failing checks. They are also the two checks no competing tool makes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const BRIEF = read('supabase/functions/seo-api/handlers/content-brief.ts');
const PLAN = read('supabase/functions/seo-api/handlers/plan.ts');
const PIPELINE = read('supabase/functions/seo-api/handlers/pipeline.ts');
const PANEL = read('src/components/core/Profile/WebsiteBrandProfilePanel.tsx');
const DASH = read('src/components/core/Profile/WebsiteSeoDashboard.tsx');

describe('the caller always wins', () => {
  it('the profile fills gaps, never overwrites', () => {
    // `base.x ?? profile.x` — never the other way round. A per-article brief naming its own
    // author is stating a fact about that article; a stored default must not replace it.
    expect(BRIEF).toMatch(/base\.provenance \?\?/);
    expect(BRIEF).toMatch(/base\.firsthandExperience \?\?/);
    expect(BRIEF, 'the profile must not take precedence over the brief')
      .not.toMatch(/p\.(author_name|methodology)\s*\?\?\s*base\./);
  });

  it('provenance falls back whole, not field by field', () => {
    // A half-merged author — their name with our bio — is a claim nobody made.
    const at = BRIEF.indexOf('provenance: base.provenance ??');
    expect(at, 'whole-object fallback not found').toBeGreaterThan(-1);
  });

  it('an empty list counts as absent, a present one does not', () => {
    // `[]` from a caller that supplied nothing must not block the profile, but a caller that
    // supplied terms must keep them.
    expect(BRIEF).toMatch(/const filled = /);
    expect(BRIEF).toMatch(/filled\(base\.brandVoice\.toneAttributes\)\s*\?\?/);
  });
});

describe('a profile we could not read is not an empty profile', () => {
  it('returns the brief untouched on error', () => {
    // Writing defaults we failed to load would be inventing provenance — the one field where an
    // invented value is worse than an absent one.
    // The supply context is not a profile default: it comes from the CRM and defaults to the safe claim.
    expect(BRIEF).toContain("if (ctx.status !== 'ok' || !p) return withSupplyContext(supabase, workspaceId, brief);");
  });
});

describe('it is actually applied, and reachable', () => {
  it('both brief entry points resolve through it', () => {
    // plan and pipeline are the two handlers that take a brief from the BODY; everything else
    // reads the stored one, so merging here means the stored brief carries it.
    for (const [name, src] of [['plan', PLAN], ['pipeline', PIPELINE]] as const) {
      expect(src, `${name} still normalizes without the profile`)
        .toMatch(/await resolveBriefWithProfile\(supabase, workspaceId, body\.content_brief, (websiteId|typeof body\.website_id === 'string' \? body\.website_id : null)\)/);
    }
  });

  it('has a screen', () => {
    // A capability nobody can fill is the bug this fixes, not a smaller version of it.
    expect(DASH).toMatch(/WebsiteBrandProfilePanel/);
    expect(DASH).toMatch(/view === 'brand'/);
    expect(readFileSync('src/components/core/Profile/seo/sections.ts', 'utf8')).toMatch(/value: 'brand', label: 'Brand profile'/);
    expect(PANEL).toMatch(/from\('workspace_brand_profile'\)/);
    expect(PANEL).toMatch(/website_id: ownVoice \? websiteId : null/);
    expect(DASH).toMatch(/<WebsiteBrandProfilePanel websiteId=\{website\.id\}/);
  });

  it('blank AI disclosure means NOT STATED, never "human wrote it"', () => {
    // The one field where a wrong default is a false claim about authorship.
    expect(PANEL).toMatch(/<option value="">Not stated<\/option>/);
  });
});

describe('a website may have its own voice', () => {
  it('its own row replaces the workspace default; a site without one uses the default', async () => {
    const { pickBrandProfile } = await import('../../supabase/functions/seo-api/handlers/content-brief.ts');
    const rows = [{ website_id: null, name: 'default' }, { website_id: 'site-b', name: 'b' }];
    expect(pickBrandProfile(rows, 'site-b')?.name).toBe('b');
    expect(pickBrandProfile(rows, 'site-a')?.name).toBe('default');
    expect(pickBrandProfile(rows, null)?.name).toBe('default');
    expect(pickBrandProfile([{ website_id: 'site-b', name: 'b' }], 'site-a')).toBeNull();
  });

  it('the pipeline resolves the brief for the article\'s own website', () => {
    expect(PIPELINE.indexOf('const websiteId = website?.id ?? null;'))
      .toBeLessThan(PIPELINE.indexOf('resolveBriefWithProfile(supabase, workspaceId, body.content_brief, websiteId)'));
  });

  it('the panel writes only profile fields, never the row identity', () => {
    expect(PANEL).toMatch(/const payload = pickProfile\(p\)/);
  });
});
