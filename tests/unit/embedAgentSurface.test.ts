/**
 * The public agent surface's allowlist IS its security boundary (#382 Phase 2/3).
 *
 * This is the only place in the platform where an anonymous stranger drives tools. The defence is
 * not judgement about what they typed — it is that the reachable set is a constant in the source
 * and nothing on it mutates anything except one Turnstile-gated write. These tests exist so that
 * stays true when somebody adds a tool in a hurry.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { PUBLIC_TOOLS, PUBLIC_TOOL_NAMES } from '../../supabase/functions/_shared/embed-agent-tools.ts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Anything that mutates a tenant's business, spends beyond one call, or reaches a system a visitor
 * has no business touching. Derived from the categories in the client TOOLKITS catalog rather than
 * invented: these are the toolkit names a public surface must never grow into.
 */
const FORBIDDEN = [
  'manage_crm', 'manage_deal', 'save_to_crm', 'create_company_from_vat', 'enrich_company_from_aade',
  'manage_finance', 'create_quote', 'generate_quote_pdf', 'list_my_quotes',
  'manage_contracts', 'manage_inbox', 'manage_reviews', 'manage_appointments', 'manage_messaging',
  'manage_email_campaign', 'manage_docs', 'search_workspace_docs',
  'create_project', 'list_my_projects', 'find_project', 'add_task', 'add_purchase_item',
  'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment', 'contact_discovery',
  'scrape_materials_from_url', 'suggest_extraction_fields',
  'track_job_search', 'find_jobs', 'manage_job_sites',
  'confirm',
];

describe('the public tool allowlist', () => {
  it('exposes nothing that mutates a tenant beyond the one quote request', () => {
    const writers = PUBLIC_TOOLS.filter((t) => t.writes).map((t) => t.name);
    expect(writers).toEqual(['raise_quote_request']);
  });

  it('contains none of the tools a stranger must never reach', () => {
    for (const name of FORBIDDEN) {
      expect(PUBLIC_TOOL_NAMES.has(name)).toBe(false);
    }
  });

  it('keeps `confirm` out — a public surface has nobody to ask', () => {
    // `confirm` is the human-in-the-loop Approve/Decline gate (CLAUDE.md invariant 9). Offering it
    // to an anonymous visitor would let them approve on the merchant's behalf.
    expect(PUBLIC_TOOL_NAMES.has('confirm')).toBe(false);
  });

  it('every entry is deterministic, so a quick-start costs no model turn', () => {
    // The whole reason the buttons exist: a visitor's first interaction returns real data and
    // bills the merchant nothing. A non-deterministic entry would silently reintroduce that cost.
    expect(PUBLIC_TOOLS.every((t) => t.deterministic)).toBe(true);
  });

  it('every entry carries a label, because it renders as a button', () => {
    for (const t of PUBLIC_TOOLS) {
      expect(t.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('the endpoint enforces the boundary rather than describing it', () => {
  const fn = read('supabase/functions/embed-agent/index.ts');

  it('checks the allowlist before building any tool', () => {
    expect(fn).toContain('PUBLIC_TOOL_NAMES.has(name)');
    // An unknown tool and a real-but-not-exposed tool must give the same answer, or the endpoint
    // enumerates the platform.
    expect(fn).toContain("'Unknown tool'");
  });

  it('bot-gates the write before the tool is constructed', () => {
    const runBlock = fn.slice(fn.indexOf("if (action === 'run')"));
    const gateAt = runBlock.indexOf('verifyTurnstile');
    const buildAt = runBlock.indexOf('buildPublicTools');
    expect(gateAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(buildAt);
  });

  it('derives the workspace from the key and never from the request', () => {
    expect(fn).toContain('authenticateEmbedKey');
    // No body-supplied tenancy, per invariant 1.
    expect(fn).not.toMatch(/params\.workspace_id|body\.workspace_id/);
  });

  it('never binds tools dynamically', () => {
    // `load_toolkit` is what lets the in-app agent widen its own set mid-conversation. On a public
    // surface that is the boundary dissolving at runtime. Comments are stripped first — both files
    // NAME it while explaining why they do not use it, and a naive text match reads that as the
    // very thing it is warning about.
    expect(blankComments(fn)).not.toContain('load_toolkit');
    expect(blankComments(read('supabase/functions/_shared/embed-agent-tools.ts'))).not.toContain('load_toolkit');
  });
});

describe('the widget renders what it runs', () => {
  const widget = read('src/embed/materialkai-assistant.ts');

  it('has a renderer for every non-writing tool it offers', () => {
    for (const t of PUBLIC_TOOLS.filter((x) => !x.writes)) {
      expect(widget).toContain(`case '${t.name}':`);
    }
  });

  it('falls back to showing the result rather than dropping it', () => {
    // The platform's own lesson: a branch that only logs is the bug, and it bites hardest on a
    // deterministic run because there is no prose to fall back on.
    expect(widget).toContain('renderUnknown');
    expect(widget).not.toMatch(/console\.debug/);
  });
});
