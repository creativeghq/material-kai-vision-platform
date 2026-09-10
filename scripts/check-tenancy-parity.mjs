#!/usr/bin/env node
/** Tenancy parity check — the "two doors" detector. */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const BASELINE = join(ROOT, '.github', 'tenancy-parity-baseline.json');
const TENANT_TABLES = new Set(
  JSON.parse(readFileSync(join(ROOT, '.github', 'tenant-tables.json'), 'utf8')).tables,
);
const SCAN_DIRS = ['supabase/functions'];

/**
 * Names a service-role client is bound to. Derived by reading the actual assignments in
 * supabase/functions — `createClient(url, SERVICE_ROLE_KEY)` is spelled a handful of ways, and a
 * name-only heuristic would miss `sb`/`svc` while over-claiming on plain `supabase` in files that
 * only ever build a user client. So the file is parsed for the assignment first (below), and this
 * list is only the fallback for helpers that receive the client as a parameter.
 */
const SERVICE_CLIENT_HINTS = /^(supabaseAdmin|admin|adminClient|svc|svcClient|serviceClient|sbAdmin)$/;

/** Chain fragments that bind the query to a tenant. Any one of these clears the finding. */
const BINDS_TENANT = [
  /\.eq\(\s*['"`]workspace_id['"`]/,
  /\.in\(\s*['"`]workspace_id['"`]/,
  /\.eq\(\s*['"`]user_id['"`]/,
  /\.eq\(\s*['"`]created_by['"`]/,
  /\.eq\(\s*['"`]owner_id['"`]/,
  /\.in\(\s*['"`]user_id['"`]/,
  /\.match\(\s*\{[^}]*workspace_id/,
  /\.or\([^)]*workspace_id/,
  /\.filter\(\s*['"`]workspace_id['"`]/,
  // A .select() that constrains through an embedded parent still reaches only in-tenant rows.
  /workspace_id\s*!inner/,
  // FETCH-THEN-VERIFY. `sb.from('projects').select('workspace_id').eq('id', projectId)` is not a
  // hole — it is the first half of the fix, pulling the owner so the caller can compare it against
  // the JWT. This is the single largest false-positive class (it dropped the finding count by more
  // than a third), and flagging it would train people to ignore the check.
  // The trade: a site that fetches workspace_id and then never compares it is invisible here.
  /\.select\(\s*['"`][^'"`]*(?:workspace_id|created_by|uploaded_by|owner_id|user_id)/,
];

/**
 * Ownership is not always spelled `workspace_id`. `catalog-tools.ts` pulls the row then checks
 * `pdf.uploaded_by !== userId`; `vies-validate` checks `company.created_by === user.id` and only
 * then writes. Both are correct — in fact catalog-tools.ts:500 is the sibling door that DOES check.
 */
const VERIFIES_OWNERSHIP = /\.(uploaded_by|created_by|owner_id|user_id|workspace_id)\s*(?:!==|===|!=|==)|userCanAccessWorkspace|assert_workspace_member|assertWorkspace/;

/** Selecting one specific row by a REQUEST-SUPPLIED id. */
const REQUEST_SOURCED_ID = String.raw`(?:input|body|args|payload|params|query|req|request)\s*(?:\?)?\s*[.\[]`;
const SELECTS_A_ROW = [
  new RegExp(String.raw`\.eq\(\s*['"\`]\w*id['"\`]\s*,\s*[^)]*${REQUEST_SOURCED_ID}`, 'i'),
  new RegExp(String.raw`\.in\(\s*['"\`]\w*id['"\`]\s*,\s*[^)]*${REQUEST_SOURCED_ID}`, 'i'),
  new RegExp(String.raw`\.match\(\s*\{[^}]*id[^}]*${REQUEST_SOURCED_ID}`, 'i'),
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Variable names in this file that hold a service-role client. Looks for the assignment itself so
 * a file that only ever builds a user-scoped client contributes nothing.
 */
function serviceClientNames(src) {
  const names = new Set();
  // const X = createClient(<url>, <...SERVICE_ROLE...>)
  const re = /(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?createClient\s*\(([\s\S]{0,300}?)\)/g;
  for (const m of src.matchAll(re)) {
    if (/SERVICE_ROLE|serviceRole|serviceKey|SERVICE_KEY/.test(m[2])) names.add(m[1]);
  }
  // const X = svcClient() / getServiceClient() / adminClient()
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?(svcClient|getServiceClient|adminClient|serviceClient|createServiceClient)\s*\(/g)) {
    names.add(m[1]);
  }
  return names;
}

/**
 * The full fluent chain starting at a `.from(` call: everything up to the statement's `;`.
 * Capped so a missing semicolon cannot swallow the rest of the file and hide a real finding
 * behind an unrelated `.eq('workspace_id', …)` further down.
 */
function chainAt(src, fromIdx) {
  const semi = src.indexOf(';', fromIdx);
  const end = semi === -1 ? Math.min(src.length, fromIdx + 800) : Math.min(semi, fromIdx + 800);
  return src.slice(fromIdx, end);
}

function analyze(src, rel) {
  const findings = [];
  const svcNames = serviceClientNames(src);
  const fileVerifies = VERIFIES_OWNERSHIP.test(src);

  for (const m of src.matchAll(/(\w+)\s*\.\s*from\(\s*['"`](\w+)['"`]\s*\)/g)) {
    const [, clientVar, table] = m;
    if (!TENANT_TABLES.has(table)) continue;
    if (!svcNames.has(clientVar) && !SERVICE_CLIENT_HINTS.test(clientVar)) continue;
    if (fileVerifies) continue;

    const chain = chainAt(src, m.index);
    if (BINDS_TENANT.some((re) => re.test(chain))) continue;
    if (!SELECTS_A_ROW.some((re) => re.test(chain))) continue;

    findings.push({
      file: rel,
      line: src.slice(0, m.index).split('\n').length,
      table,
      client: clientVar,
      snippet: chain.replace(/\s+/g, ' ').slice(0, 120),
    });
  }
  return findings;
}

function scan() {
  return SCAN_DIRS
    .flatMap((d) => walk(join(ROOT, d)))
    .flatMap((file) => analyze(readFileSync(file, 'utf8'), relative(ROOT, file).split(sep).join('/')));
}

/** Self-test — the reason this gate can be trusted when it reports zero. */
function selfTest() {
  const MUST_FLAG = `
    const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: pdf } = await supabase
      .from('catalog_source_pdfs')
      .select('*')
      .eq('id', body.source_pdf_id)
      .maybeSingle();
    if (!pdf) return json({ error: 'not found' }, 404);
  `;
  const MUST_NOT_FLAG = `
    const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: pdf } = await supabase
      .from('catalog_source_pdfs')
      .select('*')
      .eq('id', input.source_pdf_id)
      .maybeSingle();
    if (pdf.uploaded_by !== userId) return json({ error: 'Not authorized' }, 404);
  `;
  const cases = [
    ['catalog-translate-pdf (unscoped body id)', MUST_FLAG, true],
    ['the sibling door that checks uploaded_by', MUST_NOT_FLAG, false],
  ];
  let ok = true;
  for (const [name, src, shouldFlag] of cases) {
    const got = analyze(src, 'selftest.ts').length > 0;
    const pass = got === shouldFlag;
    if (!pass) ok = false;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${shouldFlag ? 'flags' : 'ignores'}: ${name}`);
  }
  return ok;
}

const args = process.argv.slice(2);

// Always, before anything else. A detector that has stopped detecting must not be able to report
// a clean codebase — that is the failure mode this whole file exists to prevent elsewhere.
console.log('Self-test:');
if (!selfTest()) {
  console.error(
    '\n❌ The tenancy detector no longer behaves as specified, so its result means nothing.\n' +
    '   Fix the detector before trusting (or baselining) any scan below.\n',
  );
  process.exit(1);
}
console.log();

const findings = scan();
const byFile = {};
for (const f of findings) byFile[f.file] = (byFile[f.file] ?? 0) + 1;

if (args.includes('--list')) {
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.table} via ${f.client}\n    ${f.snippet}`);
  console.log(`\n${findings.length} finding(s) across ${Object.keys(byFile).length} file(s).`);
  process.exit(0);
}

if (args.includes('--write-baseline')) {
  writeFileSync(BASELINE, `${JSON.stringify({ total: findings.length, files: byFile }, null, 2)}\n`);
  console.log(`Baseline written: ${findings.length} finding(s) across ${Object.keys(byFile).length} file(s).`);
  process.exit(0);
}

let base;
try {
  base = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch {
  console.error('No baseline. Create one with: node scripts/check-tenancy-parity.mjs --write-baseline');
  process.exit(1);
}

const risen = [];
for (const [file, n] of Object.entries(byFile)) {
  const was = base.files[file] ?? 0;
  if (n > was) risen.push(`  ${file}: ${was} → ${n}`);
}

if (risen.length) {
  console.error('\n❌ Unscoped service-role access to tenant data increased:\n');
  console.error(risen.join('\n'));
  console.error(
    '\nA service-role client bypasses RLS, so a query that picks a row by a body-supplied id and\n' +
    'never binds workspace_id returns ANY tenant\'s row. Bind it (`.eq(\'workspace_id\', …)` after\n' +
    'deriving the id from the verified JWT) and return 404 — not 403 — on a mismatch, so the id\n' +
    'cannot be enumerated. CLAUDE.md security invariant 1.\n' +
    '\nSee the offending lines with: node scripts/check-tenancy-parity.mjs --list\n',
  );
  process.exit(1);
}

const fixed = Object.entries(base.files).filter(([f, n]) => (byFile[f] ?? 0) < n);
console.log(`Tenancy parity: ${findings.length} finding(s) (baseline ${base.total}). No increase.`);
if (fixed.length) {
  console.log(`\n${fixed.length} file(s) improved — ratchet the baseline down:\n  node scripts/check-tenancy-parity.mjs --write-baseline`);
}
