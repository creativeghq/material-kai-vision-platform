/**
 * Guards against dead schema: a table that exists, is secured, and is reachable from nothing.
 *
 * WHY THIS EXISTS
 * ---------------
 * `validation_rules` (rule_definition jsonb, rule_type, severity, priority, is_active, auto_fix,
 * fix_action, workspace_id) and its FK'd `validation_results` log shipped with RLS and four
 * policies each, and then sat at 0 rows with 0 code references and 0 function references for
 * their entire life. Both were dropped on 2026-08-16.
 *
 * Nothing could have told us. `ops.silent_zero` — the platform's main defence against a metric
 * stuck at zero — probes for "activity happened in the window and the metric it should have
 * produced is zero", plus endpoints and crons under a 5% success rate. All three shapes require
 * the feature to have STARTED. Zero rules evaluated zero times is no activity at all, so the
 * probe reports clean and the schema keeps implying a capability that does not exist. That is
 * strictly worse than an absent table: the next person reads the columns and concludes
 * validation is handled.
 *
 * A runtime probe is the wrong instrument for this. On a database whose catalogue is still small
 * every legitimately-new table reads as empty too, so an "empty table" probe is mostly noise.
 * Reachability, on the other hand, is a static fact and does not care how much data exists yet.
 *
 * WHAT IT CANNOT SEE
 * ------------------
 * A table read only by a SQL function is invisible to a source scan, which is why DB_ONLY exists
 * and each entry names the function. And matching is by name, so a table whose name is also a
 * COLUMN name somewhere reads as referenced. Both are false negatives — this test narrows the
 * gap, it does not close it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const TYPES = join(ROOT, 'src', 'integrations', 'supabase', 'types.ts');

/** Roots that hold every runtime reference to a table. */
const SOURCE_ROOTS = ['src', 'supabase/functions', 'api', 'mivaa-pdf-extractor/app', 'scripts'];

/**
 * Files that ENUMERATE table names rather than use them. A registry mentioning a table is not a
 * feature reading it, and counting it as one is how a dead table hides: `designer_assets` has 0
 * rows, no reader and no writer, and still read as "referenced" purely because the reset wipe
 * list names it. That list names 165 tables, so leaving it in the haystack would blind this gate
 * across a third of the schema.
 */
const REGISTRY_FILES = [
  join('src', 'integrations', 'supabase', 'types.ts'),
  join('supabase', 'functions', 'reset-platform', 'index.ts'),
];
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.py', '.sql', '.json']);
const SKIP_DIRS = new Set(['node_modules', '__pycache__', '.git', 'dist', 'build', '.venv']);

/**
 * Tables reached only from inside the database. Each entry names what reads it, because the
 * claim is checkable: if the function goes, the exemption is stale and the test says so.
 * SHRINK-ONLY.
 */
const DB_ONLY: Record<string, string> = {
  cron_billing_registry:
    'read by 4 SQL functions (the per-workspace cron billing path); no client ever touches it',
  product_edge_rebuilds:
    'read by 3 SQL functions; the edge-rebuild queue is driven entirely in-database',
  taric_leaf_rules:
    'read by the TARIC classification function; the rule table is a SQL-side lookup',
  tenant_purity_audit_log:
    'written by the tenancy audit function, read by hand during an audit',
  user_contact_links_audit:
    'trigger-adjacent audit log written by 3 SQL functions; nothing reads it from code',
  job_alert_log: 'written by 2 SQL functions; 14 rows, the job-alert dedupe ledger',
  agent_uploaded_files: 'referenced by 2 SQL functions',
  product_similarity_cache: 'referenced by 1 SQL function',
  product_usage_stats: 'referenced by 1 SQL function',
  supplier_credit_note_items: 'referenced by 1 SQL function',
  warehouse_coverage: 'referenced by 1 SQL function',
};

/**
 * Tables reachable from NOTHING — not code, not a SQL function. This is the `validation_rules`
 * shape still standing. Every entry is a decision someone owes: wire it or drop it.
 * SHRINK-ONLY — an entry may be removed when the table is wired or dropped, never added to
 * without doing one of those two things first.
 */
const KNOWN_UNREFERENCED: Record<string, string> = {
  // ── BLOCKED: dead, but a LIVE table holds a foreign key into them ───────────────────────────
  // Dropping these means first altering a table that is in use, which is its own change with its
  // own blast radius — not a rider on a cleanup migration.
  agent_projects:
    'DROP, BLOCKED — empty and unreachable, but live agent_runs.agent_project_id FKs it. '
    + 'Needs that column dropped from agent_runs first.',
  agent_project_snapshots:
    'DROP, BLOCKED — empty and unreachable, but live agent_runs.snapshot_id FKs it.',
  // ── WIRE, do not drop: the parent feature is LIVE and the gap is user-facing ────────────────
  // A DROP here would delete a design that is actually wanted. The fix is a writer.
  kb_doc_versions:
    'WIRE — kb_docs has 677 live rows and no edit history.',
  kb_doc_comments:
    'WIRE — the KB is live; commenting is designed and unbuilt.',
  email_template_versions:
    'WIRE — 22 live email_templates whose edits are currently unrecoverable.',
};


function tableNames(): string[] {
  const src = readFileSync(TYPES, 'utf8');
  const block = src.match(/ {2}Tables: \{([\s\S]*?)\n {4}Views: \{/);
  expect(block, 'could not locate the Tables block in the generated types').toBeTruthy();
  const names = [...block![1].matchAll(/^ {6}([a-z0-9_]+): \{$/gm)].map((m) => m[1]);
  // A regeneration that produced nothing would make this test pass vacuously.
  expect(names.length, 'parsed 0 tables out of types.ts — the generator format changed').toBeGreaterThan(100);
  return names;
}

function sourceHaystack(): string {
  const chunks: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (SOURCE_EXTS.has(extname(entry.name)) && !REGISTRY_FILES.includes(relative(ROOT, full))) {
        try {
          chunks.push(readFileSync(full, 'utf8'));
        } catch {
          /* unreadable file is not a reference */
        }
      }
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(ROOT, root));
  return chunks.join('\n');
}

/**
 * How many source files each root actually contributed.
 *
 * An ABSENT root is indistinguishable, to the scan, from a root that references nothing — and
 * this check's whole verdict is "nothing references it". That is not hypothetical: `walk()`
 * swallows a missing directory, `mivaa-pdf-extractor` is a git submodule, and CI checked out the
 * parent repo without it. So `mivaa-pdf-extractor/app` was EMPTY in CI and populated on every dev
 * box, and the scan declared 39 live tables dead — every table MIVAA owns. Four of them had been
 * written by the daily job-search cron that same morning. The suite was green locally and red in
 * CI, and unlike the `docLinks` case (where CI was right and the dev box was lying), here the dev
 * box was right and CI was blind.
 *
 * A scanner that cannot see its haystack must SAY SO rather than convict everything in it.
 */
function rootFileCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of SOURCE_ROOTS) {
    let n = 0;
    const walk = (dir: string) => {
      let entries: ReturnType<typeof readdirSync>;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name)); }
        else if (SOURCE_EXTS.has(extname(e.name))) n += 1;
      }
    };
    walk(join(ROOT, root));
    counts[root] = n;
  }
  return counts;
}

describe('dead schema', () => {
  const names = tableNames();
  const hay = sourceHaystack();
  const unreferenced = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(hay));

  /**
   * Runs before the verdict, because the verdict is worthless without it. Named per root so the
   * failure says WHICH one is missing instead of leaving the next person to rediscover that a
   * submodule was never checked out.
   */
  it('every source root is actually present and populated', () => {
    const counts = rootFileCounts();
    const empty = SOURCE_ROOTS.filter((r) => counts[r] === 0);
    expect(
      empty,
      `Source root(s) missing or empty: ${empty.join(', ')}.\n`
      + 'This check convicts a table when NOTHING references it, so an unreadable root makes it '
      + 'report every table that root owns as dead. `mivaa-pdf-extractor` is a git submodule — if '
      + 'it is the empty one, the checkout needs `submodules: recursive` (it is a public repo, so '
      + 'the default token suffices). Counts: '
      + SOURCE_ROOTS.map((r) => `${r}=${counts[r]}`).join(', '),
    ).toEqual([]);
  });

  it('no NEW table is reachable from nothing', () => {
    const known = new Set([...Object.keys(DB_ONLY), ...Object.keys(KNOWN_UNREFERENCED)]);
    const fresh = unreferenced.filter((n) => !known.has(n));
    expect(
      fresh,
      `These tables exist in the schema and are referenced by no code:\n  ${fresh.join('\n  ')}\n\n`
      + 'A table nothing reaches is not inert — it advertises a capability the platform does not '
      + 'have, and no runtime probe can see it (silent_zero needs the feature to have STARTED). '
      + 'Wire it, drop it, or — if it is read only by a SQL function — add it to DB_ONLY naming '
      + 'the function.',
    ).toEqual([]);
  });

  it('the exemptions are still true', () => {
    const stale = [...Object.keys(DB_ONLY), ...Object.keys(KNOWN_UNREFERENCED)].filter(
      (n) => !names.includes(n) || !unreferenced.includes(n),
    );
    expect(
      stale,
      `These exemptions no longer describe reality: ${stale.join(', ')}. The table was either `
      + 'dropped or wired up — remove its entry. Both lists are shrink-only, and an exemption '
      + 'nobody prunes is how an allowlist turns into a second source of truth.',
    ).toEqual([]);
  });

  it('the dead pair that motivated this gate stays dropped', () => {
    for (const gone of ['validation_results']) {
      expect(
        names.includes(gone),
        `${gone} is back in the generated types. It was a generic admin-editable rule engine `
        + 'with auto_fix/fix_action — the data-integrity framework already does that job, and '
        + 'deliberately does NOT let an admin edit the rules, because a SECURITY DEFINER '
        + 'function running admin-supplied SQL is a privilege-escalation surface. Field-level '
        + 'plausibility lives on material_metadata_fields.validation_rules.',
      ).toBe(false);
    }
  });

  /**
   * #378 N9/D2 — two abandoned systems whose SCHEMA was the thing that read as live.
   *
   * `proposals` (dropped 2026-08-30) was a complete-looking second quoting API over a table that
   * never held a row; `shopping_carts` / `cart_items` were the rest of it; `designer_projects` had
   * one reader in the entire codebase — a `count` on a Profile tile, which could therefore render
   * nothing but 0 beside real numbers.
   *
   * Named individually rather than left to the general check above, because the general check
   * only convicts a table NOTHING mentions — and each of these survived it at some point by being
   * mentioned. `cart_items` was held up by a COMMENT (`.from('quote_items') // Changed from
   * cart_items`), and `proposals` by the three routes `quotes-api` was still serving. A mention is
   * not a use, and re-adding any of these is a decision someone has to argue for.
   */
  it('the abandoned cart / proposal / designer-project tables stay dropped', () => {
    for (const gone of ['proposals', 'shopping_carts', 'cart_items', 'designer_projects']) {
      expect(
        names.includes(gone),
        `${gone} is back in the generated types. Live quotes are \`quotes\` / \`quote_items\`; `
        + 'live projects are `projects`. If a cart or a proposal is genuinely wanted, it needs a '
        + 'writer and a UI in the same change — not a table that reads as a capability.',
      ).toBe(false);
    }
  });
});
