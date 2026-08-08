/**
 * Catalog-authority guard (#324).
 *
 * The bug this exists to stop: a verified manufacturer publishes a price and it lands on every
 * buyer's negotiated cost. `supplier_products.cost` is what THIS workspace agreed to pay THAT
 * supplier — two workspaces legitimately hold different costs for the same SKU — so a global
 * write would silently erase every negotiated contract on the platform, while every row stayed
 * a perfectly valid number. No integrity check on stored data can see that, and no typecheck can
 * either.
 *
 * The design instead is: publishing writes the factory's ASK onto the shared master row and
 * notifies the operator. `accept_master_price` is the only route to a real cost, it is
 * operator-gated, and it writes the root workspace alone.
 *
 * SCOPE — read this before assuming a clean run means the invariant holds.
 * These tests scan REPO FILES, so they see only the TypeScript half. This project's SQL is
 * applied through the Supabase MCP and never committed as a file (CLAUDE.md), so an RPC body
 * lives only in `pg_proc` and is invisible here. The SQL half is guarded in SQL by the
 * `catalog.publish_writes_cost` integrity check
 * (`dic_detect__catalog_publish_writes_cost`), which fails if a `publish_*` function writes a
 * cost column or if `accept_master_price` stops restricting its write to the root workspace.
 * A green `npm test` says nothing about that half.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CATALOG_SERVICE = 'src/services/catalogMasterService.ts';
const PRICING_SERVICE = 'src/services/supplierPricingService.ts';
const CLAIMS_SERVICE = 'src/services/supplierClaimsService.ts';

describe('catalog authority — publishing never reaches a tenant cost', () => {
  it('the publish service writes no product or supplier cost table directly', () => {
    const src = read(CATALOG_SERVICE);
    // Everything this service does must go through an RPC that enforces the gate server-side.
    // A direct table write from here would bypass `supplier_publishing_allowed` entirely.
    const directWrites = [
      /\.from\(\s*['"]supplier_products['"]\s*\)\s*\.\s*(insert|update|upsert|delete)/,
      /\.from\(\s*['"]products['"]\s*\)\s*\.\s*(insert|update|upsert|delete)/,
      /\.from\(\s*['"]product_prices['"]\s*\)\s*\.\s*(insert|update|upsert|delete)/,
    ];
    for (const re of directWrites) {
      expect(re.test(src), `catalogMasterService must not write costs directly: ${re}`).toBe(false);
    }
  });

  it('publishing a price goes through the RPC and nothing else', () => {
    const src = read(CATALOG_SERVICE);
    expect(src).toContain("supabase.rpc('publish_master_product_price'");
    expect(src).toContain("supabase.rpc('accept_master_price'");
    // The accept path is the ONLY one allowed to move a cost, and it is operator-gated in SQL.
    expect(src).toContain("supabase.rpc('publish_master_product_facts'");
  });

  it('the publishable field allowlist contains no money, identity or trust fields', () => {
    const src = read(CATALOG_SERVICE);
    const block = src.match(/PUBLISHABLE_FACT_FIELDS\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(block, 'PUBLISHABLE_FACT_FIELDS must exist as a literal list').toBeTruthy();
    const fields = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(0);

    // A manufacturer describes the product. It never sets what anything costs, who owns the
    // row, or whether the row is trusted.
    const forbidden = [
      'cost', 'price', 'list_price', 'unit_cost', 'cost_basis', 'markup_percent', 'discount',
      'workspace_id', 'user_id', 'created_by', 'supplier_company_id', 'platform_supplier_id',
      'field_authority', 'authority', 'id', 'master_product_id', 'status',
    ];
    for (const f of fields) {
      expect(forbidden, `"${f}" must not be publishable by a manufacturer`).not.toContain(f);
    }
  });
});

describe('supplier pricing — a tenant cost is written only by its own workspace', () => {
  it('upsert builds an explicit payload rather than spreading caller input', () => {
    const src = read(PRICING_SERVICE);
    // Mass assignment (invariant 8): a spread lets a caller set workspace_id/product_id and
    // write a row into a workspace that is not theirs.
    expect(/\.(insert|update|upsert)\(\s*\{\s*\.\.\./.test(src),
      'supplierPricingService must not spread input into a DB write').toBe(false);
    expect(src).toContain('workspace_id: workspaceId');
    expect(src).toContain('product_id: productId');
  });

  it('does not import the publish service — the two price worlds stay separate', () => {
    const src = read(PRICING_SERVICE);
    // Match a real import, not a mention: the file's own docs explain the boundary by naming
    // the other service, and a substring test would flag that prose as a violation.
    const imports = /^\s*import\s[^;]*from\s*['"][^'"]*catalogMasterService['"]/m;
    expect(imports.test(src),
      'a tenant price editor must not reach into the manufacturer publish path').toBe(false);
  });
});

describe('supplier claims — publishing rights follow the confirmed person', () => {
  it('exposes the publishing gate and the operator-only revoke', () => {
    const src = read(CLAIMS_SERVICE);
    expect(src).toContain('my_supplier_claim_status');
    expect(src).toContain('revoke_supplier_claim');
    expect(src).toContain('get_supplier_claim_queue');
  });

  it('the claim status type carries the confirmed-contact flag', () => {
    const src = read(CLAIMS_SERVICE);
    // Workspace membership is never enough to publish — the UI must be able to tell the
    // confirmed person from a colleague who merely shares the workspace.
    expect(src).toContain('is_confirmed_contact');
  });
});

describe('flows wiring for the catalog triggers', () => {
  const TRIGGERS = ['catalog_master_updated', 'supplier_price_changed'];
  const MIRRORS = [
    'src/services/flows/types.ts',
    'src/services/flows/triggerVariables.ts',
    'src/components/Admin/FlowsManagement/MyFlowsTab.tsx',
    'src/components/Admin/FlowsManagement/nodes/TriggerNode.tsx',
    'src/components/Admin/FlowsManagement/utils/paletteItems.ts',
  ];

  it('every trigger appears in every mirror that must know about it', () => {
    // A trigger missing from one of the exhaustive maps is a silent hole: the flow runs but
    // renders unlabelled, or the palette cannot offer it at all.
    for (const trigger of TRIGGERS) {
      for (const file of MIRRORS) {
        expect(read(file).includes(trigger), `${trigger} missing from ${file}`).toBe(true);
      }
    }
  });
});
