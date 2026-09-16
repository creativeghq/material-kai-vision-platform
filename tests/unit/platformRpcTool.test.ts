import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { PLATFORM_RPC_WITHHELD, platformRpcAccess, withheldRpcNames } from '../../src/config/platformRpcAccess';
import { buildCatalog } from '../../scripts/gen-platform-rpc-catalog.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => stripComments(read(p));

const TOOL = 'supabase/functions/_shared/tools/platform-rpc-tools.ts';
const CATALOG_FILE = 'supabase/functions/_shared/platformRpcCatalog.generated.ts';
const src = code(TOOL);
const catalog = buildCatalog() as Array<{ name: string; subject: string; args: Array<{ name: string; required?: boolean }> }>;

describe('the reader can only ever read', () => {
  it('calls PostgREST with GET, which runs read-only and refuses a VOLATILE function', () => {
    // A POST would let a writer through even if one ever reached the catalogue.
    expect(src).toMatch(/method: 'GET'/);
    expect(src, 'a POST appeared in the call path').not.toMatch(/method: 'POST'/);
  });

  it('sends the user JWT, never the service role', () => {
    expect(src).toMatch(/Authorization: `Bearer \$\{jwt\}`/);
    expect(src, 'a service-role key appears in the read path').not.toContain('SERVICE_ROLE');
  });

  it('fails closed with no session', () => {
    const call = src.slice(src.indexOf('createCallPlatformRpcTool'));
    const guard = call.indexOf('if (!jwt)');
    const fetchAt = call.indexOf('await fetch(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard, 'the session check runs after the read').toBeLessThan(fetchAt);
  });

  it('reads the runtime URL lazily, never at module load', () => {
    expect(src).not.toMatch(/const\s+SUPABASE_URL\s*=\s*Deno\.env\.get/);
    expect(src).toMatch(/const supabaseUrl = \(\) => Deno\.env\.get/);
  });
});

describe('the catalogue is derived, and holds no writer', () => {
  it('the generated file is fresh', () => {
    const gen = require('../../scripts/gen-platform-rpc-catalog.mjs');
    expect(read(CATALOG_FILE).replace(/\r\n/g, '\n'))
      .toBe(gen.render(gen.buildCatalog()).replace(/\r\n/g, '\n'));
  });

  it('every entry is shaped like a read', () => {
    expect(catalog.length).toBeGreaterThan(50);
    for (const e of catalog) {
      expect(e.name, `${e.name} is not named like a read`)
        .toMatch(/^(get|list|search)_|(_summary|_overview|_360)$/);
    }
  });

  it('no known writer is in the catalogue', () => {
    // Real mutating RPCs here: lose the volatility filter and one of them lands in the catalogue.
    const writers = [
      'pos_issue_receipt', 'issue_credit_note', 'mark_rent_paid', 'recompute_invoice_tax_totals',
      'bill_time_entries_to_invoice', 'create_workspace_invite', 'set_workspace_member_role',
      'autoapprove_pending_items_for_document', 'mark_invoice_issued',
    ];
    const names = new Set(catalog.map((e) => e.name));
    for (const w of writers) expect(names.has(w), `${w} reached the read catalogue`).toBe(false);
  });

  it('the AADE mirror is not one of our figures', () => {
    const names = new Set(catalog.map((e) => e.name));
    expect(names.has('get_mydata_book_aggregate')).toBe(false);
    expect(read(CATALOG_FILE)).not.toContain('mydata_book');
  });

  it('the refresh query keeps the volatility filter', () => {
    // 36 VOLATILE functions match the same name and result shape; this predicate is the only split.
    const gen = read('scripts/gen-platform-rpc-catalog.mjs');
    expect(gen).toContain("provolatile in ('s','i')");
    expect(gen).toContain("has_function_privilege('authenticated'");
  });
});

describe('cost and margin do not leak through a generic reader', () => {
  it('withholds the readers the coverage baseline says need a role gate', () => {
    for (const name of ['get_product_costs', 'get_invoice_item_costs', 'get_order_item_costs',
      'get_monthly_pnl', 'get_project_pnl', 'get_party_profit_position']) {
      expect(platformRpcAccess(name).access, name).toBe('withheld');
    }
  });

  it('every withheld reader still exists, so a rename cannot silently open one', () => {
    const names = new Set(catalog.map((e) => e.name));
    for (const name of withheldRpcNames()) {
      expect(names.has(name), `${name} is withheld but is no longer in the catalogue`).toBe(true);
    }
  });

  it('each one carries a stated reason', () => {
    for (const e of PLATFORM_RPC_WITHHELD) {
      expect(e.reason.trim().length, `${e.name} has no reason`).toBeGreaterThan(15);
    }
  });

  it('the withheld check runs BEFORE the read', () => {
    const call = src.slice(src.indexOf('createCallPlatformRpcTool'));
    const gate = call.indexOf("access === 'withheld'");
    const fetchAt = call.indexOf('await fetch(');
    expect(gate).toBeGreaterThan(-1);
    expect(gate, 'the sensitivity gate runs after the figure was already read').toBeLessThan(fetchAt);
  });

  it('an ordinary read stays open — the list is the exception', () => {
    const open = catalog.filter((e) => platformRpcAccess(e.name).access === 'open');
    expect(open.length).toBeGreaterThan(catalog.length / 2);
  });
});

describe('the model cannot invent arguments', () => {
  it('an undeclared argument is refused rather than sent', () => {
    expect(src).toContain('unknownArgs');
    const call = src.slice(src.indexOf('createCallPlatformRpcTool'));
    expect(call.indexOf('unknownArgs'), 'the argument check runs after the read')
      .toBeLessThan(call.indexOf('await fetch('));
  });

  it('a missing required argument is named, not guessed', () => {
    expect(src).toMatch(/a\.required && supplied\[a\.name\] === undefined/);
    expect(src).toContain('rather than guessing one');
  });

  it('a result too big to trust says so instead of reading as complete', () => {
    expect(src).toContain('MAX_RESULT_CHARS');
    expect(src).toContain('Do not report this as the complete answer');
  });
});

describe('the tools are reachable', () => {
  it('both are in a toolkit cluster, or they are stripped before the model sees them', () => {
    const cat = code('src/components/features/ai/agentToolsCatalog.ts');
    expect(cat).toContain("'discover_platform_data'");
    expect(cat).toContain("'call_platform_rpc'");
  });

  it('at least one agent lists them, which is what actually binds a tool', () => {
    const agentChat = code('supabase/functions/agent-chat/index.ts');
    expect((agentChat.match(/'discover_platform_data', 'call_platform_rpc'/g) ?? []).length)
      .toBeGreaterThan(0);
    expect(agentChat).toContain('createCallPlatformRpcTool(userJwt, onChunk)');
  });

  it('their output is registered, or the card renders nothing', () => {
    const hub = code('src/components/features/ai/AgentHub.tsx');
    expect(hub).toContain('platform_data_matches:');
    expect(hub).toContain('platform_data_result:');
  });
});
