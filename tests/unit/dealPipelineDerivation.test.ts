/**
 * Deal-pipeline guard (#311).
 *
 * The pipeline was Real Estate's, with its seven stages written as a TypeScript union and a
 * `STAGES` array in the board:
 *
 *   lead → viewing → offer → under_offer → conveyancing → exchanged → completed
 *
 * "Conveyancing" and "exchanged" are property-transfer terms. The moment a second kind of deal
 * exists — a project, a construction job, whatever a tenant invents — a single shared stage list
 * puts that deal in a column that is nonsense for it, and a hardcoded `stage === 'completed'`
 * marks the wrong thing won. Neither is visible to a typecheck: both are valid strings.
 *
 * So stages are DATA (`crm_deal_stages`, one set per `crm_deal_types` row), the database enforces
 * the pairing through a composite FK on `(deal_type_id, stage)`, and this file fails the build if
 * a stage list, or the old table, comes back into the frontend.
 *
 * SCOPE — a green run here does NOT prove the invariant holds. This scans REPO FILES, so it sees
 * the TypeScript half only. The composite FK, the `subject_kind` CHECK and the RLS visibility rule
 * live in `pg_proc`/`pg_constraint` and are invisible here (this project's SQL is applied via the
 * Supabase MCP and never committed — CLAUDE.md). The DB half is guarded by the constraints
 * themselves, which reject the bad write rather than reporting it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SERVICE = 'src/services/dealsService.ts';
const BOARD = 'src/components/business/crm/PipelineBoard.tsx';

/**
 * Stage keys that exist ONLY as property deal stages, so a literal is unambiguous evidence the
 * shared list is back. 'under_offer' is deliberately absent: it is also a LISTING STATUS on
 * `properties` (draft/active/under_offer/sold/...), a separate vocabulary that legitimately
 * shares the word — watching it flagged three innocent files on the first run.
 */
const PROPERTY_ONLY_STAGES = ['conveyancing', 'exchanged'];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const FILES = walk(join(ROOT, 'src'));
const SOURCES = new Map(
  FILES.map((f) => [relative(ROOT, f).replace(/\\/g, '/'), stripComments(readFileSync(f, 'utf8'))]),
);

describe('the deal pipeline has one object and data-driven stages', () => {
  it('scans the files it claims to scan', () => {
    expect(existsSync(join(ROOT, SERVICE)), `${SERVICE} is missing`).toBe(true);
    expect(existsSync(join(ROOT, BOARD)), `${BOARD} is missing`).toBe(true);
    expect(SOURCES.size).toBeGreaterThan(500);
  });

  it('no component hardcodes a property stage key', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      if (path === SERVICE) continue;
      for (const stage of PROPERTY_ONLY_STAGES) {
        if (src.includes(`'${stage}'`) || src.includes(`"${stage}"`)) { offenders.push(`${path} (${stage})`); break; }
      }
    }
    expect(
      offenders,
      'Stage keys are rows in crm_deal_stages, owned by a deal type. A literal here is the old ' +
      'shared-stage-list bug returning: it renders a Conveyancing column for a construction deal.',
    ).toEqual([]);
  });

  it('winning a deal reads is_won rather than testing for a stage name', () => {
    const board = SOURCES.get(BOARD)!;
    expect(board).toContain('is_won');
    // The old board did `act({ stage: 'completed', status: 'won' })`.
    expect(
      /stage:\s*['"][a-z_]+['"]/.test(board),
      'The board is assigning a literal stage. Which stage wins/starts is the deal type\'s data.',
    ).toBe(false);
  });

  it('the renamed object has no stragglers', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      if (/\bproperty_deals\b|\bproperty_deal_tasks\b/.test(src)) offenders.push(path);
    }
    expect(
      offenders,
      'property_deals was renamed to crm_deals. A leftover reference is a runtime 404 against a ' +
      'table that no longer exists — the shape that broke real-estate-api mid-rename.',
    ).toEqual([]);
  });

  it('there is one pipeline board, and Real Estate is a consumer of it', () => {
    expect(existsSync(join(ROOT, 'src/modules/real-estate/components/PipelineBoard.tsx')),
      'The Real Estate copy of the board is back. There is one board; Real Estate pins it to a deal type.').toBe(false);
    const rePage = SOURCES.get('src/modules/real-estate/pages/RealEstatePage.tsx')!;
    expect(rePage).toContain('@/components/business/crm/PipelineBoard');
    expect(rePage).toMatch(/lockedTypeKey=["']real_estate["']/);
  });

  it('subject_kind stays a closed set', () => {
    // Tenants define deal TYPES freely; they cannot invent a SUBJECT, because code branches on it
    // to render a panel and populate an FK. Widening this union means widening the DB CHECK on
    // crm_deal_types.subject_kind in the same change — the "four places at once" footgun.
    const service = SOURCES.get(SERVICE)!;
    const m = service.match(/subject_kind:\s*([^;]+);/);
    expect(m, 'DealType.subject_kind is gone or reshaped').toBeTruthy();
    const declared = (m![1].match(/'[a-z_]+'/g) ?? []).map((s) => s.replace(/'/g, '')).sort();
    expect(
      declared,
      'subject_kind must match the CHECK on crm_deal_types.subject_kind. Adding a value here ' +
      'without the migration fails at runtime with a CHECK violation while typechecking clean.',
    ).toEqual(['none', 'project', 'property']);
  });

  it('deals are read through the one service, not by ad-hoc table queries', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      if (path === SERVICE) continue;
      if (/from\(\s*['"]crm_deals['"]\s*\)/.test(src)) offenders.push(path);
    }
    expect(
      offenders,
      'crm_deals is read and written through dealsService. A second query path is a second place ' +
      'that has to remember the deal-type filter and the embed hints.',
    ).toEqual([]);
  });
  it('lifecycle_stage is reachable: option list matches the DB CHECK, and the API may write it', () => {
    // Two halves that fail differently and silently.
    //
    // 1. The option list and the CHECK on crm_contacts.lifecycle_stage are a pair. Adding a value
    //    to one only fails at runtime, on save, with a CHECK violation.
    // 2. crm-api keeps an ALLOWLIST of writable contact columns. A field the UI renders but the
    //    allowlist omits saves nothing and reports success — the comment on that list names
    //    lead_status and department as the two it already hid.
    const consts = readFileSync(join(ROOT, 'src/modules/crm/crmConstants.ts'), 'utf8');
    const m = consts.match(/LIFECYCLE_STAGE_OPTIONS[\s\S]*?\];/);
    expect(m, 'LIFECYCLE_STAGE_OPTIONS is gone').toBeTruthy();
    const values = [...m![0].matchAll(/value:\s*'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(
      values,
      'LIFECYCLE_STAGE_OPTIONS must match the CHECK on crm_contacts.lifecycle_stage exactly.',
    ).toEqual(['customer', 'evangelist', 'lead', 'mql', 'opportunity', 'other', 'sql', 'subscriber']);

    const handler = readFileSync(join(ROOT, 'supabase/functions/crm-api/handlers/contacts-api-handler.ts'), 'utf8');
    const allowlist = handler.match(/CONTACT_WRITABLE_COLUMNS[\s\S]*?\] as const;/);
    expect(allowlist, 'CONTACT_WRITABLE_COLUMNS is gone').toBeTruthy();
    expect(
      allowlist![0].includes("'lifecycle_stage'"),
      'lifecycle_stage is missing from CONTACT_WRITABLE_COLUMNS, so the funnel field on the contact ' +
      'page saves nothing and still reports success.',
    ).toBe(true);
  });

  it('a deal is reachable from the party it is attached to', () => {
    // crm_deals carries contact_id/company_id. Until the record pages rendered them, that link
    // worked one way only — attachable, then invisible from the contact. A one-way link is
    // indistinguishable from no link for anyone working from the record.
    for (const page of [
      'src/modules/crm/pages/ContactDetailPage.tsx',
      'src/modules/crm/pages/CompanyDetailPage.tsx',
    ]) {
      expect(SOURCES.get(page), `${page} no longer shows the deals on this record`).toContain('PartyDealsCard');
    }
  });

  it('tenants can define their own deal types', () => {
    // The tables and RLS supported tenant-defined types from the start; without this screen nobody
    // could reach that, which is the same as not having built it.
    const board = SOURCES.get(BOARD)!;
    expect(board).toContain('DealTypeManager');
    const mgr = SOURCES.get('src/components/business/crm/DealTypeManager.tsx');
    expect(mgr, 'DealTypeManager is gone').toBeTruthy();
    // Creation must stay atomic: a type whose stages failed to write renders an empty board.
    expect(
      SOURCES.get(SERVICE)!,
      'Deal types must be created through crm_create_deal_type, which writes the type and its ' +
      'stages in one transaction. Two inserts can leave a type with no stages — a board with no ' +
      'columns and no way to add a deal.',
    ).toContain("rpc('crm_create_deal_type'");
  });
});
