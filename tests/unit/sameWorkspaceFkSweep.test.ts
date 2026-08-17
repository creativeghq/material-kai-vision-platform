/**
 * Live sweep: every write that stores a workspace-scoped foreign key taken from the REQUEST BODY
 * is accounted for — either it proves the referenced row is the caller's, or it is listed here
 * with the guarantee that makes it safe.
 *
 * `sameWorkspaceFkGuard.test.ts` pins the sites this class was already fixed in. This file is the
 * half that matters more: it re-runs the SEARCH on every build, so a NEW site fails the day it is
 * written rather than in an audit two months later.
 *
 * That distinction is the whole lesson. The class was found in real estate (#356 `RE-4`), paired
 * with CRM (#353 `CRM-5`), and assumed to be a two-module problem. Sweeping for the SHAPE found
 * it in five more places, in modules nobody had connected to it. A list of the places somebody
 * already looked is not coverage.
 *
 * WHY AN ACKNOWLEDGEMENT LIST RATHER THAN CLEVER DETECTION. A first version tried to decide
 * automatically whether each site was guarded, by looking for a workspace check near the value.
 * It was wrong in both directions and each fix broke a different case — most instructively, the
 * insert payload itself reads `workspace_id: workspaceId, warehouse_item...`, so a write could
 * vouch for itself and stock-api's real bug read as guarded. A guard that is subtly wrong about
 * what it has verified is worse than one that asks a human once. So: the sweep flags every site,
 * and a site leaves the list only by calling the shared helper on the value or by being written
 * down with a reason. New code fails closed.
 *
 * The FK set is DERIVED, not typed out: every relationship in `types.ts` whose referenced table
 * carries a `workspace_id`. A new workspace-scoped table is watched as soon as the generated
 * types know about it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const FUNCS = join(ROOT, 'supabase', 'functions');
const TYPES = join(ROOT, 'src', 'integrations', 'supabase', 'types.ts');

/** These files are CRLF; every pattern below is written against \n. */
const read = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');

/**
 * Sites that do not call the shared helper, each with the guarantee that makes it safe.
 *
 * SHRINK-ONLY, and every entry was read by hand. Adding one means asserting you traced the value
 * and found the equivalent check — not that the test was noisy. An exemption list is where
 * findings hide, which is why the reasons are themselves asserted below.
 */
const EXEMPT: Record<string, string> = {
  'crm-api/handlers/address-units-api-handler.ts':
    'parentWorkspace({company_id, contact_id}, scope) resolves the workspace FROM the party within '
    + "the caller's scope and 404s otherwise; the row's workspace_id is that result.",
  'crm-api/handlers/companies-api-handler.ts':
    'contactInScope(contact_id, scope) is checked explicitly before the insert — this is #353 CRM-5, '
    + 'already fixed, with a comment naming the PII leak it closes.',
  'hr-api/index.ts':
    "Inline `.eq('id', employeeId).eq('workspace_id', workspaceId)` immediately above the insert, "
    + 'commented "Employee must belong to this workspace."',
  'hr-api/labour.ts':
    'assertEmployee() filters hr_employees on ctx.workspaceId — the same check under a local name.',
  'zernio-api/handlers/publish.ts':
    'Compares account.workspace_id !== post.workspace_id explicitly, then userCanAccessWorkspace.',
  'revolut-api/index.ts':
    "The update itself carries .eq('workspace_id', workspaceId), so a foreign id matches no row.",
  'gsc-api/index.ts':
    'websiteId arrives inside an HMAC state string this server signed and verifies (verifyState).',
  'project-plan-engine/index.ts':
    'The workspace is DERIVED from the referenced project/blueprint and then requireWorkspace() '
    + 'authorises the caller for it — the reference defines the tenant rather than crossing it.',
  'quotes-api/index.ts':
    'workspace_id on the new row is taken from the loaded quote, not from the body.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** FK columns whose referenced table is workspace-scoped, derived from the generated types. */
function workspaceScopedFkColumns(): Set<string> {
  const src = read(TYPES);

  const scoped = new Set<string>();
  const tableRe = /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm;
  let t: RegExpExecArray | null;
  while ((t = tableRe.exec(src))) {
    if (/^\s*workspace_id\??:/m.test(t[2])) scoped.add(t[1]);
  }

  const cols = new Set<string>();
  const relRe = /columns: \[([^\]]*)\][\s\S]{0,120}?referencedRelation: "(\w+)"/g;
  let r: RegExpExecArray | null;
  while ((r = relRe.exec(src))) {
    if (!scoped.has(r[2])) continue;
    for (const c of r[1].split(',')) {
      const name = c.trim().replace(/^"|"$/g, '');
      if (name) cols.add(name);
    }
  }
  // `workspace_id` is the tenancy column itself, not a reference that needs checking against one.
  // Every route verifies it at the entry gate with `userCanAccessWorkspace` — that IS the check,
  // and flagging it would bury the real findings under every write in the codebase.
  cols.delete('workspace_id');
  return cols;
}

interface Site { rel: string; line: number; col: string; text: string }

function findBodySuppliedFkWrites(fkCols: Set<string>): Site[] {
  const sites: Site[] = [];

  for (const file of walk(FUNCS)) {
    const src = stripComments(read(file));
    const rel = relative(FUNCS, file).split('\\').join('/');
    const lines = src.split('\n');

    // Locals carrying a body value — `const warehouseId = String(body?.warehouse_id)`. Without
    // this the sweep misses the site that taught it to look: stock-api's warehouse_id reaches the
    // payload through a local, so `body` never appears on the assignment line.
    const bodyLocals = new Set<string>();
    for (const l of lines) {
      const decl = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/.exec(l);
      if (decl && /\bbody\b/.test(decl[2])) bodyLocals.add(decl[1]);
      const destructured = /^\s*(?:const|let)\s*\{([^}]*)\}\s*=\s*body\b/.exec(l);
      if (destructured) {
        for (const part of destructured[1].split(',')) {
          const name = part.split(':').pop()!.trim().replace(/=.*$/, '').trim();
          if (name) bodyLocals.add(name);
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const back = lines.slice(Math.max(0, i - 14), i).join('\n');
      if (!/\.(insert|upsert|update)\s*\(/.test(back)) continue;

      const kv = /^\s*([a-z_][a-z0-9_]*)\s*:\s*(.+?),?\s*$/.exec(lines[i]);
      const shorthand = /^\s*([a-z_][a-z0-9_]*)\s*,\s*$/.exec(lines[i]);
      const col = kv?.[1] ?? shorthand?.[1];
      const rhs = kv?.[2] ?? shorthand?.[1];
      if (!col || !rhs || !fkCols.has(col)) continue;

      // An id read off a LOADED ROW (`website?.id`, `meeting.id`) is not a body scalar: holding
      // the row means the function fetched it, and the fetches here are workspace-scoped.
      if (/^[A-Za-z_$][\w$]*\??\.id\b/.test(rhs.trim())) continue;

      const fromBody = /\bbody\b/.test(rhs)
        || [...bodyLocals].some((v) => new RegExp(`\\b${v.replace(/\$/g, '\\$')}\\b`).test(rhs));
      if (!fromBody) continue;

      sites.push({ rel, line: i + 1, col, text: lines[i].trim().slice(0, 100) });
    }
  }
  return sites;
}

describe('the FK set is derived from the schema, not typed out', () => {
  const cols = workspaceScopedFkColumns();

  it('parses a substantial set out of types.ts', () => {
    // A parse that silently matches nothing turns this file into a test that always passes —
    // the failure `deadSchema` documents for an absent source root.
    expect(cols.size, 'no workspace-scoped FK columns parsed — the types.ts shape changed and '
      + 'this sweep is now scanning for nothing').toBeGreaterThan(100);
  });

  it('includes the columns this class was actually found on', () => {
    for (const c of ['product_id', 'warehouse_id', 'crm_contact_id', 'subject_id', 'employee_id', 'company_id']) {
      expect(cols.has(c), `${c} is no longer recognised as a workspace-scoped FK`).toBe(true);
    }
  });
});

describe('every body-supplied workspace-scoped FK write is accounted for', () => {
  it('checks the value, or is listed with the guarantee that makes it safe', () => {
    const sites = findBodySuppliedFkWrites(workspaceScopedFkColumns());
    expect(sites.length, 'the sweep found nothing at all — it has stopped scanning')
      .toBeGreaterThan(0);

    const offenders = sites.filter((s) => {
      if (EXEMPT[s.rel]) return false;
      return !/assert(All)?SameWorkspace\s*\(/.test(stripComments(read(join(FUNCS, s.rel))));
    });

    expect(
      offenders.map((o) => `${o.rel}:${o.line}  ${o.col}  |  ${o.text}`),
      'a workspace-scoped foreign key is taken from the request body and stored without proving '
        + 'the referenced row belongs to the caller. Both halves look valid — the workspace is '
        + 'verified, the id is a real row — and nothing checks them against each other, so a later '
        + "service-role join returns another tenant's data. Call assertSameWorkspace from "
        + '_shared/same-workspace.ts on the value, or add an EXEMPT entry stating the guarantee '
        + 'you traced:\n  ',
    ).toEqual([]);
  });

  it('the exemption list has not grown a bare entry', () => {
    for (const [site, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${site} is exempt without a real reason`).toBeGreaterThan(40);
      expect(reason, `${site}'s exemption does not say what makes it safe`)
        .toMatch(/workspace|scope|HMAC|derived|loaded|resolved|inserted|signed|provider/i);
    }
  });

  it('no exemption is stale', () => {
    // An entry for a file the sweep no longer flags is a claim nobody is checking any more —
    // and it would silently re-exempt the file if the site came back.
    const flagged = new Set(findBodySuppliedFkWrites(workspaceScopedFkColumns()).map((s) => s.rel));
    const stale = Object.keys(EXEMPT).filter((rel) => !flagged.has(rel));
    expect(stale, 'these files are exempt but no longer contain a body-supplied FK write — '
      + 'remove them so the list keeps meaning what it says').toEqual([]);
  });
});
