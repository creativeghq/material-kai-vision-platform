import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => stripComments(read(p));

const TOOL = 'supabase/functions/_shared/tools/crm-tools.ts';
const CATALOG = 'src/components/features/ai/agentToolsCatalog.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const AGENT_HUB = 'src/components/features/ai/AgentHub.tsx';
const MANIFEST = 'src/components/features/ai/toolManifest.generated.ts';

const src = code(TOOL);
/** The tool body, from its factory to the end of the file. */
const body = src.slice(src.indexOf('export const createManageCounterpartyBankAccountTool'));

describe('the tool is reachable at all', () => {
  it('a real factory exists', () => {
    expect(body.length, 'the factory anchor moved').toBeGreaterThan(1000);
  });

  it('it is listed by at least one agent, not merely pushed', () => {
    // A push site is not a binding: both binding paths read AGENT_CONFIGS[agentId].tools, so a
    // tool with a perfect registration line that no agent LISTS is unreachable by everyone.
    const chat = code(AGENT_CHAT);
    const from = chat.indexOf('const AGENT_CONFIGS');
    const to = chat.indexOf('async function recoverAssistantMessage', from);
    expect(from, 'the AGENT_CONFIGS anchor moved').toBeGreaterThan(-1);
    expect(to, 'the AGENT_CONFIGS end anchor moved').toBeGreaterThan(from);
    const configs = chat.slice(from, to);
    expect(configs).toContain("'manage_counterparty_bank_account'");
    expect(chat).toContain("config.tools.includes('manage_counterparty_bank_account')");
  });

  it('it is in a toolkit cluster, and the cluster module-gates', () => {
    const catalog = code(CATALOG);
    expect(catalog).toContain("'manage_counterparty_bank_account'");
    // The CRM cluster declares moduleSlug 'crm'; the tool must ask the same gate, because
    // EntitlementGuard on the page is UX and this reaches the table without passing it.
    expect(body).toContain("moduleGate(workspaceId, 'crm')");
  });

  it('the module the tool gates on is a real modules row', () => {
    // A moduleSlug naming no row makes every entitlement check false forever — the finance/
    // sales-finance shape, which hid a whole toolkit from everyone including the operator.
    const catalog = code(CATALOG);
    const crmCluster = catalog.slice(
      catalog.indexOf("id: 'crm',"),
      catalog.indexOf("id: 'crm',") + 400,
    );
    expect(crmCluster).toContain("moduleSlug: 'crm'");
  });

  it('the generated manifest carries it with a real enum action', () => {
    // An unresolved enum degrades to type:'string' in the AST projection, which kills the
    // autoFields select with every gate still green.
    const manifest = read(MANIFEST);
    const entry = manifest.slice(manifest.indexOf("name: 'manage_counterparty_bank_account'"));
    expect(entry.slice(0, 1200)).toContain("factory: 'createManageCounterpartyBankAccountTool'");
    expect(entry.slice(0, 1200)).toMatch(/name: 'action', type: 'enum'/);
  });

  it('both chunk types it emits are registered for render', () => {
    // An unregistered onChunk type is dropped silently, and this toolkit has a DIRECT-run
    // quick-start — no model turn, so there is no prose to fall back on.
    const hub = code(AGENT_HUB);
    const titles = hub.slice(hub.indexOf('const AGENT_RESULT_TITLES'), hub.indexOf('const AGENT_RESULT_TITLES') + 6000);
    for (const chunk of ['crm_bank_accounts_listed', 'crm_bank_account_saved']) {
      expect(body, `${chunk} is asserted but nothing emits it`).toContain(`type: '${chunk}'`);
      expect(titles, `${chunk} has no AGENT_RESULT_TITLES entry`).toContain(`${chunk}:`);
    }
  });
});

describe('an IBAN is checked before it is stored, by the one implementation', () => {
  it('the mod-97 comes from the mirror, never a local copy', () => {
    // `public.iban_is_valid` is the CHECK behind this table. A second implementation that drifts
    // looser surfaces a raw 23514; one that drifts tighter refuses an IBAN the bank honours.
    expect(src).toContain("from '../iban.generated.ts'");
    expect(body).toContain('isValidIban(');
    expect(body).toContain('normalizeIban(');
    expect(body, 'a second mod-97 has appeared in this file').not.toMatch(/%\s*97/);
    expect(body).not.toMatch(/charCodeAt\(0\)\s*-\s*55/);
  });

  it('a failing checksum refuses the write instead of storing it', () => {
    const add = body.slice(body.indexOf("if (action === 'add')"));
    const guardAt = add.indexOf('isValidIban');
    const insertAt = add.indexOf('.insert(payload)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(guardAt, 'the IBAN is validated AFTER the row is written').toBeLessThan(insertAt);
  });

  it('an empty IBAN is refused rather than stored as a null destination', () => {
    // isValidIban returns true for '' by design (a half-typed value stays editable in a form),
    // so the emptiness check is a separate obligation the form has and this must have too.
    const add = body.slice(body.indexOf("if (action === 'add')"), body.indexOf('.insert(payload)'));
    expect(add).toMatch(/if \(!normalizedIban\)/);
  });
});

describe('the write is allowlisted and narrow', () => {
  it('the payload is an explicit literal, never a spread of model arguments', () => {
    const add = body.slice(body.indexOf("if (action === 'add')"));
    const payload = add.slice(add.indexOf('const payload = {'), add.indexOf('.insert(payload)'));
    expect(payload.length).toBeGreaterThan(200);
    expect(payload, 'the payload spreads something').not.toMatch(/\.\.\./);
    expect(payload).toContain('workspace_id: workspaceId');
  });

  it('is_primary is pinned false on add', () => {
    // A transcribed account becoming the default payee as a side effect is the same failure as
    // a wrong IBAN, one step removed. Promotion is its own confirmed act.
    const add = body.slice(body.indexOf("if (action === 'add')"));
    const payload = add.slice(add.indexOf('const payload = {'), add.indexOf('.insert(payload)'));
    expect(payload).toContain('is_primary: false');
  });

  it('there is no update and no delete path', () => {
    // Changing or removing an EXISTING payment destination behind the operator is how money
    // reaches the wrong account. Both stay in the UI; the schema must not offer them either.
    expect(body).not.toContain('.delete()');
    expect(body).not.toMatch(/from\('crm_bank_accounts'\)[\s\S]{0,40}\.update\(/);
    const schema = body.slice(body.indexOf('action: z.enum('));
    expect(schema.slice(0, 120)).toBe(
      schema.slice(0, 120).replace(/'update'|'remove'|'delete'/g, 'FORBIDDEN'),
    );
  });

  it('the writes run as the USER, so RLS is the boundary', () => {
    // Every policy on crm_bank_accounts is is_workspace_member(workspace_id); the service-role
    // client this file uses elsewhere satisfies all four unconditionally.
    expect(body).toContain('SUPABASE_ANON_KEY');
    expect(body).toMatch(/Authorization: `Bearer \$\{jwt/);
    const add = body.slice(body.indexOf("if (action === 'add')"));
    expect(add, 'the insert runs on the service-role client').toMatch(/sb\(\)[\s\S]{0,80}\.insert\(payload\)/);
  });

  it('a missing session fails closed', () => {
    const preamble = body.slice(0, body.indexOf("if (action === 'set_primary')"));
    expect(preamble).toMatch(/if \(!jwt\)/);
  });

  it('every id taken from the model is scoped to the RUNNING workspace, not just to RLS', () => {
    // RLS and this check answer different questions. RLS asks whether the caller is a member of
    // the row's workspace, and a multi-workspace user is a member of several; the agent runs in
    // ONE of them, and that is the one whose records it may touch (invariant 1).
    for (const [label, table] of [['set_primary', 'crm_bank_accounts'], ['contact', 'crm_contacts']] as const) {
      const at = body.indexOf(`from('${table}').select`) >= 0
        ? body.indexOf(`from('${table}')`)
        : body.indexOf(`from('${table}')`);
      expect(at, `${label}: the lookup moved`).toBeGreaterThan(-1);
      const lookup = body.slice(at, body.indexOf('.maybeSingle()', at) + 20);
      expect(lookup, `${label}: the id lookup is not workspace-scoped`)
        .toContain(".eq('workspace_id', workspaceId)");
    }
  });

  it('no read drops its error and reports it as "not found"', () => {
    // A dropped error renders as "No such … in this workspace", which blames the user's data
    // for a query fault — and on the duplicate check it reads as "no match", which is exactly
    // when a second row gets written.
    const reads = body.match(/const \{\s*data\b[^}]*\} = await/g) ?? [];
    expect(reads.length, 'no supabase destructures found — the regex broke').toBeGreaterThanOrEqual(5);
    for (const r of reads) {
      expect(r, `a read destructures data without error: ${r}`).toMatch(/\berror\b/);
    }
  });

  it('the duplicate check cannot be defeated by an existing duplicate', () => {
    // There is no unique index on (company_id, iban), so `.maybeSingle()` ERRORS on an
    // already-duplicated row rather than returning it.
    const add = body.slice(body.indexOf("if (action === 'add')"));
    const dup = add.slice(add.indexOf('let dupQ'), add.indexOf('already_present'));
    expect(dup).toContain('.limit(1)');
    expect(dup, 'maybeSingle throws on the row this check exists to find').not.toContain('.maybeSingle()');
  });
});

describe('the human gate comes before the side effect', () => {
  it('add emits the confirmation and returns BEFORE inserting', () => {
    const add = body.slice(body.indexOf("if (action === 'add')"));
    const gateAt = add.indexOf('confirm !== true');
    const chunkAt = add.indexOf("type: 'action_confirmation'");
    const insertAt = add.indexOf('.insert(payload)');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(chunkAt);
    expect(chunkAt, 'the row is written before the user is asked').toBeLessThan(insertAt);
    // …and it must actually stop. A gate that emits a card and falls through is not a gate.
    const gateBlock = add.slice(gateAt, insertAt);
    expect(gateBlock).toContain('awaiting_confirmation: true');
  });

  it('set_primary is gated the same way', () => {
    const sp = body.slice(body.indexOf("if (action === 'set_primary')"), body.indexOf("if (action === 'list')"));
    const gateAt = sp.indexOf('confirm !== true');
    const rpcAt = sp.indexOf("rpc('crm_set_primary_bank_account'");
    expect(gateAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(rpcAt);
  });

  it('set_primary goes through the RPC, not a two-phase client write', () => {
    // Clear-the-others then set-this cannot half-apply and leave the counterparty with no
    // primary at all (#366 BU-4, pipeline convention 3).
    const sp = body.slice(body.indexOf("if (action === 'set_primary')"), body.indexOf("if (action === 'list')"));
    expect(sp).toContain("rpc('crm_set_primary_bank_account'");
    expect(sp).not.toMatch(/\.update\(\s*\{\s*is_primary/);
  });

  it('confirm is declared for the Approve card but reachable by nobody else', () => {
    // The field has to exist: the Approve/Decline card releases the gate by re-invoking the
    // tool with confirm:true. What must not exist is any path that lets the MODEL set it — it
    // is in MODEL_FORBIDDEN_ARG_KEYS (stripped from model-authored arguments) and on NEVER_ASK,
    // so no quick-start form or fixedArgs pin can pre-answer it on the user's behalf.
    const schema = body.slice(body.indexOf('schema: z.object({'));
    expect(schema).toMatch(/confirm:\s*z\.boolean\(\)/);
    const catalog = code(CATALOG);
    const at = catalog.indexOf("run: { tool: 'manage_counterparty_bank_account'");
    expect(at).toBeGreaterThan(-1);
    expect(catalog.slice(at, at + 600)).not.toContain('confirm');
  });

  it('the direct-run quick-start only ever reads', () => {
    // A quick-start with `run` skips the model entirely, so a pinned write action would perform
    // one with no turn and no gate in between.
    const catalog = code(CATALOG);
    const qs = catalog.slice(
      catalog.indexOf("run: { tool: 'manage_counterparty_bank_account'"),
      catalog.indexOf("run: { tool: 'manage_counterparty_bank_account'") + 200,
    );
    expect(qs).toContain("action: 'list'");
  });
});

describe('an absent answer is stated, not implied', () => {
  it('list distinguishes "none on file" from an empty array', () => {
    const list = body.slice(body.indexOf("if (action === 'list')"), body.indexOf("if (action === 'add')"));
    expect(list).toContain('found: false');
    expect(list).toContain('found: true');
    expect(list).toContain('note:');
  });

  it('list with no counterparty answers "what is our house format"', () => {
    // Found by replaying the conversation: asked to follow "the format we do for all the
    // other", the model could only sample one counterparty per call, checked three, found none,
    // and told the user NOBODY had accounts on file while fifteen existed — a generalisation
    // from three, stated as fact. The workspace-wide read is what makes that question
    // answerable.
    const listAll = body.slice(body.indexOf("action === 'list' && !contact_id"), body.indexOf('let parent'));
    expect(listAll.length, 'the workspace-wide list branch is gone').toBeGreaterThan(300);
    expect(listAll).toContain("scope: 'workspace'");
    // …and it must say it is a SAMPLE, or the model generalises from 25 the way it did from 3.
    expect(listAll).toMatch(/not the complete list/);
    expect(listAll).toContain('found: false');
    expect(listAll).toContain('found: true');
  });

  it('a re-transcribed IBAN is reported as already present, not inserted twice', () => {
    const add = body.slice(body.indexOf("if (action === 'add')"));
    const dupAt = add.indexOf('already_present: true');
    const insertAt = add.indexOf('.insert(payload)');
    expect(dupAt).toBeGreaterThan(-1);
    expect(dupAt).toBeLessThan(insertAt);
  });
});

describe('the company resolver is declared once', () => {
  it('crm-tools has exactly one fuzzy company lookup', () => {
    // Two copies existed and had drifted: one searched name_fold/name_xscript and the other
    // only `name`, so a Greek counterparty was reachable by its Latin trade name from one tool
    // and not the other. Half the names in this CRM are Greek and the operator types Latin.
    const matches = src.match(/name_xscript\.ilike/g) ?? [];
    expect(matches.length, 'the transliterated-name lookup has been copied again').toBe(1);
    expect(src).toContain('async function resolveCompanyInWorkspace');
    // Every caller goes through it.
    const callers = src.match(/resolveCompanyInWorkspace\(/g) ?? [];
    expect(callers.length).toBeGreaterThanOrEqual(4); // 1 declaration + 3 call sites
  });

  it('a name that differs only by SPACING still resolves', () => {
    // Found by replaying the failed conversation: the company is stored as "… NEW PLAN …" and
    // prints "NEWPLAN" on its own letterhead, so the model queried the spelling in front of it
    // and got "No matching company in this workspace" — a confident false negative for a
    // company that exists. name_fold lowercases and name_xscript transliterates; neither
    // collapses whitespace, and no index can.
    expect(src).toContain('const nameShape =');
    // Strips everything that is not a letter or digit — Greek included, or a Greek name would
    // collapse to nothing and match every company in the workspace.
    expect(src).toMatch(/nameShape[\s\S]{0,160}u0370-\\u03ff/);
    expect(src).toContain('async function resolveByShape');
  });

  it('a partial scan is never reported as an absence', () => {
    // The de-spaced pass reads rows rather than an index, so it is capped. Returning [] at the
    // cap would turn "we looked at 1000 of 5000" into "no such company" — the confident-wrong
    // answer this pass exists to remove, reintroduced one layer down.
    const fn = src.slice(src.indexOf('async function resolveByShape'));
    expect(fn).toMatch(/if \(data\.length > SHAPE_SCAN_CAP\) return null/);
    const caller = src.slice(src.indexOf('async function resolveCompanyInWorkspace'), src.indexOf('const nameShape'));
    expect(caller).toMatch(/if \(!found\)/);
    expect(caller).toContain('too many to compare');
  });

  it('the de-spaced pass runs only when the indexed match found nothing', () => {
    const caller = src.slice(src.indexOf('async function resolveCompanyInWorkspace'), src.indexOf('const nameShape'));
    expect(caller).toMatch(/matches && matches\.length > 0[\s\S]{0,80}resolveByShape/);
  });

  it('the resolver scopes to the workspace, which is the ownership check', () => {
    const fn = src.slice(
      src.indexOf('async function resolveCompanyInWorkspace'),
      src.indexOf('export const createCrmKadSearchTool'),
    );
    expect(fn).toContain(".eq('workspace_id', workspaceId)");
  });
});
