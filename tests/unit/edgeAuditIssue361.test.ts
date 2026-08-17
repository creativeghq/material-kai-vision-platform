/**
 * Guards for audit #361 — the findings that are not covered by an existing guard file.
 *
 * The gateway's three (`EG-1`–`EG-3`) live in `mivaaGatewayAuthorization.test.ts`, and the SSRF
 * site `EG-18` is pinned by the stored-URL sweep in `imageFetchGuard.test.ts`. What is left is a
 * set of one- and two-line properties that are individually small and were individually invisible:
 * a hard-coded currency symbol, a persisted signed URL, a re-derived money quantity, an
 * unfenced prompt interpolation. None of them raise, none of them fail a typecheck, and all of
 * them produce a plausible-looking result — which is why they need a test that reads the source
 * rather than a reviewer who remembers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const FUNCS = join(__dirname, '..', '..', 'supabase', 'functions');
const read = (rel: string) => readFileSync(join(FUNCS, rel), 'utf8');

/**
 * Comments stripped — LINE comments first. Several of these files mention `/api/rag/*` or
 * `image/*` inside `//` comments, and a block-comment-first strip reads that `/*` as an opening
 * delimiter and deletes everything to the next close.
 */
function codeOnly(src: string): string {
  return sharedStripComments(src);
}

// ── EG-5: SERP text is competitor-authored and must reach the model fenced ──────────────────
describe('EG-5 — SERP-derived text is fenced as DATA before it reaches an LLM', () => {
  const untrusted = codeOnly(read('seo-api/handlers/untrusted.ts'));

  it('the fence helper neutralises its own delimiter', () => {
    // Fencing without this is decoration: a value containing `</serp_data>` closes the block
    // early and everything after it reads as prompt.
    const fn = untrusted.slice(untrusted.indexOf('export function serpValue('));
    expect(fn.slice(0, fn.indexOf('\n}')), 'serpValue no longer strips the fence characters')
      .toMatch(/\[<>\]/);
  });

  it('the fence states that its contents are not instructions', () => {
    expect(untrusted, 'the DATA declaration is gone from the fence').toMatch(/is DATA/);
    expect(untrusted, 'the fence no longer disclaims instructions').toMatch(/instruction/i);
    expect(untrusted).toContain('<serp_data>');
  });

  it.each([
    ['seo-api/handlers/plan.ts', 'the planner'],
    ['seo-api/handlers/write.ts', 'the writer'],
  ])('%s runs SERP values through the fence', (rel) => {
    const src = codeOnly(read(rel));
    expect(src, `${rel} no longer imports the fence`).toContain("from './untrusted.ts'");
    expect(src, `${rel} no longer wraps its SERP block`).toContain('serpBlock(');

    // The specific interpolations the audit named: Google's AI Overview paragraph and the
    // snippet a competitor currently holds. Both are free text from a page we do not control.
    expect(src, `${rel} interpolates aiOverviewText raw again`)
      .not.toMatch(/\$\{signals\.aiOverviewText[.\s]/);
    expect(src, `${rel} interpolates the featured-snippet description raw again`)
      .not.toMatch(/\$\{signals\.featuredSnippetTarget\.description\}/);
  });
});

// ── EG-6: the generated article HTML is a deliverable, pasted into someone's CMS ────────────
describe('EG-6 — generated markdown is escaped before it becomes HTML', () => {
  const src = codeOnly(read('seo-api/handlers/pipeline.ts'));

  it('escapes the source once, up front, with the canonical escaper', () => {
    expect(src, 'the local escaper is gone — invariant 11 says use the shared one')
      .toContain("from '../../_shared/html.ts'");
    expect(
      src,
      'markdownToHtml stopped escaping its input. Raw <script> in model output — which is fed ' +
        'competitor-authored SERP text — passes straight into the deliverable.',
    ).toMatch(/let html = escapeHtml\(markdown\)/);
  });

  it('sanitises the one attribute it emits', () => {
    expect(src, 'link hrefs are interpolated unsanitised again — javascript: is live in React 18')
      .not.toMatch(/'<a href="\$2">/);
    expect(src, 'safeHref is gone').toContain('safeHref(');
    const fn = src.slice(src.indexOf('function safeHref('));
    expect(fn.slice(0, fn.indexOf('\n}')), 'safeHref no longer restricts the scheme')
      .toContain('SAFE_HREF_RE');
  });
});

// ── EG-7: interlink suggestions are a deliverable and must not cross a tenant ───────────────
describe('EG-7 — interlink candidates are workspace-scoped', () => {
  it('both seo_articles lookups narrow by workspace when one is resolved', () => {
    const src = codeOnly(read('seo-api/handlers/pipeline.ts'));
    const scoped = src.match(/\.eq\('workspace_id', workspaceId\)/g) ?? [];
    expect(
      scoped.length,
      'an interlink lookup is scoped by author alone again. A user in two workspaces gets the ' +
        "other tenant's article titles, slugs and target keywords offered as link targets.",
    ).toBeGreaterThanOrEqual(2);
  });
});

// ── EG-11 / EG-12 / EG-13 / EG-15: the moodboard deck is CLIENT-FACING ──────────────────────
describe('EG-11 — the client-view deck renders only its own tenant material', () => {
  const src = codeOnly(read('generate-moodboard-sheet-pdf/index.ts'));
  const deck = src.slice(src.indexOf('async function buildClientViewPdf('));

  it('scopes the sub-sheets, products and quote FF&E it embeds', () => {
    expect(deck, 'fetchSheets is called unscoped again — sheet_ids can name another tenant\'s sheet')
      .not.toMatch(/fetchSheets\(supabase, sheetIds\)/);
    expect(deck, 'fetchProductChips is called unscoped again')
      .not.toMatch(/fetchProductChips\(supabase, ids\)/);
    expect(deck, 'fetchQuoteFfeItems is called unscoped again — that leaks a tenant\'s prices')
      .not.toMatch(/fetchQuoteFfeItems\(supabase, qid\)/);
    expect(deck, 'the deck no longer resolves an owner scope').toContain('ownerWorkspaceIds');
  });

  it('scopes to the deck OWNER, not the caller', () => {
    // This function is also invoked service-role by `moodboard-sheet-share` for an anonymous
    // link holder. There is no caller identity there, which is exactly when the artifact is
    // most exposed — so the boundary has to be a property of the deck.
    expect(deck, 'the owner scope is conditional on a caller identity again')
      .toMatch(/deckScopeUserId/);
  });
});

describe('EG-12 — a private-bucket signed URL is never persisted', () => {
  it('the sheet row stores the path and not the URL', () => {
    const src = codeOnly(read('generate-moodboard-sheet-pdf/index.ts'));
    expect(
      src,
      'a signed URL is being written to moodboard_presentation_sheets.pdf_url again. ' +
        'pdf-documents is private, so the stored URL is a credential that expires in place ' +
        'while the row keeps claiming it works. Re-deriving from pdf_storage_path is free.',
    ).not.toMatch(/pdf_url:\s*signed\?\.signedUrl\s*\?\?\s*null,\s*\n\s*pdf_generated_at/);
  });
});

describe('EG-13 — regenerating a PDF does not rewrite an already-shared object', () => {
  const src = codeOnly(read('generate-moodboard-sheet-pdf/index.ts'));

  it.each([
    ['sheet-${sheetId}', 'moodboard-output'],
    ['cv-${viewId}', 'client-view-output'],
  ])('%s is versioned', (stem) => {
    // A fixed path + `upsert: true` means a client who opens the link they were sent gets
    // different content than the one they were shown, with nothing to indicate it changed.
    expect(
      src,
      `${stem}.pdf is a fixed path again — regeneration silently replaces content behind an ` +
        'already-distributed link',
    ).not.toContain(`${stem}.pdf\``);
  });
});

describe('EG-15 — an ownership mismatch is a 404, not a 403', () => {
  it('neither moodboard ownership check confirms the id exists', () => {
    const src = codeOnly(read('generate-moodboard-sheet-pdf/index.ts'));
    expect(src, 'a 403 on an ownership mismatch is an id-enumeration oracle')
      .not.toMatch(/Not authorized for this (sheet|client view)/);
  });
});

// ── EG-14: currency is a property of the money, never of the renderer ───────────────────────
describe('EG-14 — FF&E prices carry their own currency', () => {
  it('the schedule does not hard-code a euro sign', () => {
    const src = codeOnly(read('generate-moodboard-sheet-pdf/builders.ts'));
    expect(
      src,
      'a currency symbol is hard-coded into a document handed to a client. Use formatMoney ' +
        'with the value\'s own currency.',
    ).not.toMatch(/`€\$\{/);
    expect(src).toContain('formatMoney(');
  });

  it('the currency reaches the renderer from the owning quote', () => {
    expect(codeOnly(read('generate-moodboard-sheet-pdf/data-fetcher.ts')))
      .toMatch(/currency:\s*\(quoteRow/);
  });
});

// ── EG-16: unit_cost is what WE pay, and it was labelled as though it were not ──────────────
describe('EG-16 — supplier cost is labelled honestly and printed only on request', () => {
  const src = codeOnly(read('generate-purchase-sheet-pdf/index.ts'));

  it('is not labelled "Unit price"', () => {
    expect(
      src,
      'unit_cost is the SUPPLIER cost. Labelled "Unit price" on a spec sheet, an operator ' +
        'reasonably reads it as the customer-facing figure and forwards the 7-day link.',
    ).not.toMatch(/rows\.push\(\['Unit price'/);
    expect(src).toContain("'Supplier cost'");
  });

  it('requires an explicit opt-in', () => {
    expect(src, 'the cost opt-in is gone — cost is printed by default again')
      .toMatch(/const includeCosts = body\.include_costs === true/);
    expect(src, 'specRows no longer gates the cost row').toMatch(/includeCosts && it\.unit_cost/);
  });
});

// ── EG-20: TypeScript formats money; it does not derive it ──────────────────────────────────
describe('EG-20 — the purchase order renderer does not re-derive a line total', () => {
  it('prints the stored line_total or fails', () => {
    const src = codeOnly(read('generate-purchase-sheet-pdf/index.ts'));
    expect(
      src,
      'the renderer recomputes quantity * unit_cost when line_total is missing. The header ' +
        'prints the STORED subtotal/VAT/total, so after a discount or tax edit the lines do ' +
        'not add up to the document\'s own total — a valid number, so nothing raises.',
    ).not.toMatch(/line_total\s*\?\?\s*\(Number\(it\.quantity/);
    expect(src, 'a missing line_total no longer fails loudly').toMatch(/has no stored line_total/);
  });
});

// ── EG-21: a telemetry write that cannot fail visibly reports zero forever ──────────────────
describe('EG-21 — a failed analytics write is reported, not swallowed', () => {
  it('captures the error and says the event was not recorded', () => {
    const src = codeOnly(read('products-3d-api/index.ts'));
    expect(
      src,
      'the analytics insert failure is console.error + { ok: true } again — an RLS or schema ' +
        'regression leaves merchant analytics at exactly zero while every call reports success',
    ).toMatch(/captureException\(/);
    expect(src, 'the response no longer distinguishes recorded from not-recorded')
      .toMatch(/recorded: false/);
  });
});

// ── EG-8: a retry must not re-run a pipeline that bills at every stage ──────────────────────
describe('EG-8 — the SEO pipeline deduplicates a repeated request', () => {
  const src = codeOnly(read('seo-api/handlers/pipeline.ts'));

  it('honours an explicit idempotency key', () => {
    expect(src, 'the idempotency key is gone — a retry starts and bills a second full run')
      .toContain('idempotency_key');
    expect(src, 'a matched key no longer returns the earlier run').toMatch(/deduplicated: true/);
  });

  it('refuses to start a second run while one is already in flight', () => {
    expect(src, 'the in-flight duplicate guard is gone').toContain('IN_FLIGHT_WINDOW_MS');
    // Bounded by age: a run whose isolate died leaves a non-terminal row forever, and an
    // unbounded guard would block that keyword permanently.
    expect(src, 'the in-flight guard lost its age bound and can now wedge a keyword')
      .toMatch(/gte\('created_at'/);
  });

  it('both checks run before the article row and every debit', () => {
    const keyAt = src.indexOf('const idempotencyKey');
    const inFlightAt = src.indexOf('IN_FLIGHT_WINDOW_MS');
    const insertAt = src.indexOf("from('seo_articles')\n      .insert(");
    expect(keyAt).toBeGreaterThan(-1);
    expect(inFlightAt).toBeGreaterThan(-1);
    expect(insertAt, 'the article insert was not found — this case cannot see what it guards')
      .toBeGreaterThan(-1);
    expect(keyAt, 'the key is read after the run has already been created').toBeLessThan(insertAt);
    expect(inFlightAt, 'the in-flight check runs after the run has already been created')
      .toBeLessThan(insertAt);
  });

  it('does not silently skip the guard when the lookup fails', () => {
    // A rejected filter resolves rather than throwing in supabase-js, so an unreadable guard
    // is a guard that is not running — and the cost is a duplicated paid pipeline.
    expect(src, 'the in-flight lookup error is discarded again').toContain('inFlightErr');
  });

  it('the key cannot be moved onto another row by an update', () => {
    const allowlist = src.slice(src.indexOf('const ARTICLE_COLUMNS'));
    expect(
      allowlist.slice(0, allowlist.indexOf(']')),
      'idempotency_key became updatable — a key that can be reassigned hands a caller ' +
        "somebody else's article",
    ).not.toContain('idempotency_key');
  });
});

// ── The SSRF rule must see a URL that arrives on a row, not just a bare identifier ──────────
describe('EG-18 — the semgrep SSRF rule matches member-expression URLs', () => {
  it('the metavariable regex accepts row.field forms', () => {
    const yml = readFileSync(
      join(__dirname, '..', '..', '.github', 'semgrep-security.yml'), 'utf8',
    );
    const rule = yml.slice(yml.indexOf('no-unguarded-download-of-user-url'));
    const m = /regex: (\S+)/.exec(rule);
    expect(m, 'the URL metavariable regex is gone').not.toBeNull();
    const re = new RegExp(m![1]);
    // The three real call sites this rule failed to see.
    for (const sample of ['it.design_image_url', 'webhook.url', 'job.source_url', 'imageUrl']) {
      expect(re.test(sample), `the SSRF rule no longer matches ${sample}`).toBe(true);
    }
    // And it still does not fire on things that are not URLs.
    for (const sample of ['payload', 'supabase', 'body']) {
      expect(re.test(sample), `the SSRF rule now matches ${sample}, which is noise`).toBe(false);
    }
  });
});
