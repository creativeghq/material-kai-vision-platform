/**
 * An agent tool reaches this workspace's records, and only this workspace's (#395).
 *
 * Two files, one shape, found by running #352's pattern 2 — "service-role client plus a
 * model-supplied id" — over the slices #395 lists as unread. Plus the expense tool's half of the
 * create-then-pay pair, which is CLAUDE.md anti-regression rule 4 on the agent surface.
 *
 * ── the original finding ──────────────────────────────────────────────────────────────────────
 * A catalog belongs to a workspace, and the tool that opens it has to know which.
 *
 * `loadCatalog` is the gate for nine catalog tools. `catalog_id` is a model-supplied argument, the
 * client is service-role, and the only check was `owner_user_id === userId` — a USER identity, not
 * a tenancy binding. So a catalog you own in workspace B was readable, editable and publishable
 * from a workspace-A session: one agent turn moves another tenant's catalogue body into this
 * workspace's work. The sibling path in the same file already scoped source PDFs by
 * `catalog.workspace_id` under a comment naming it a BOLA guard; this one was simply never given
 * the workspace.
 *
 * This is #352's pattern 2 — "service-role client plus a model-supplied id" — found for the third
 * and fourth time, in the slice #395 lists as unread.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const catalogTools = read('supabase/functions/_shared/tools/catalog-tools.ts');
const projectTools = read('supabase/functions/_shared/tools/project-tools.ts');
const expenseTools = read('supabase/functions/_shared/tools/expense-tools.ts');
const mentionTools = read('supabase/functions/_shared/tools/mention-tools.ts');
const jobTools = read('supabase/functions/_shared/tools/job-research-tools.ts');
const agentChat = read('supabase/functions/agent-chat/index.ts');

describe('#395 — the catalog gate is bound to a workspace', () => {
  it('loadCatalog takes the session workspace and checks it', () => {
    expect(catalogTools).toMatch(
      /async function loadCatalog\(supabase: any, catalogId: string, ownerId: string, workspaceId: string \| null\)/,
    );
    expect(catalogTools).toMatch(/data\.workspace_id !== workspaceId/);
    // 404-style, so an id cannot be probed for existence (invariant 1).
    expect(catalogTools).toMatch(/return \{ error: 'Catalog not found' \};/);
  });

  it('the owner check is still there — this closed a hole, it did not open one', () => {
    // Dropping it would hand every teammate edit rights on a colleague's catalogue, which is a
    // product decision and not part of a tenancy fix.
    expect(catalogTools).toMatch(/data\.owner_user_id !== ownerId/);
  });

  it('every call site passes it', () => {
    const calls = [...catalogTools.matchAll(/loadCatalog\(supabase, [^)]*\)/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const call of calls) {
      expect(call, call).toMatch(/, userId, workspaceId\)$/);
    }
  });

  it('every factory that reaches it receives the workspace', () => {
    for (const factory of [
      'createAttachCatalogPdfsTool', 'createExtractFromCatalogPdfsTool', 'createAddMaterialToCatalogTool',
      'createFindImageForMaterialTool', 'createGenerateCatalogPdfTool', 'createAdjustCatalogPricingTool',
      'createPublishCatalogTool', 'createTranslatePdfToCatalogTool', 'createCreateCatalogTool',
    ]) {
      const decl = catalogTools.match(new RegExp(`export const ${factory} = \\(([^)]*)\\)`));
      expect(decl, factory).not.toBeNull();
      expect(decl![1], factory).toContain('workspaceId: string | null');
    }
  });

  it('and the binder actually passes it', () => {
    // A factory that accepts a workspace and is constructed without one is the same hole with a
    // longer signature.
    const pushes = [...agentChat.matchAll(/tools\.push\((create\w*Catalog\w*Tool|createAddMaterialToCatalogTool|createFindImageForMaterialTool|createTranslatePdfToCatalogTool|createExtractFromCatalogPdfsTool|createAdjustCatalogPricingTool)\(([^)]*)\)\)/g)];
    expect(pushes.length).toBeGreaterThanOrEqual(9);
    for (const m of pushes) {
      expect(m[2], m[0]).toMatch(/\buserId, workspaceId\b/);
    }
  });

  it('the translate path scopes its source PDF too', () => {
    const fn = catalogTools.slice(catalogTools.indexOf('export const createTranslatePdfToCatalogTool'));
    expect(fn.slice(0, 2500)).toMatch(/pdf\.workspace_id !== workspaceId/);
    expect(fn.slice(0, 2500)).toMatch(/Source PDF not found/);
  });
});

describe('#395 — a project is reached through its workspace, not just its owner', () => {
  it('the resolver takes the session workspace and filters on it', () => {
    expect(projectTools).toMatch(
      /async function resolveProjectId\(\s*userId: string, workspaceId: string \| null, projectId\?: string, projectName\?: string,\s*\)/,
    );
    // Both arms — the explicit id and the fuzzy name.
    const fn = projectTools.slice(projectTools.indexOf('async function resolveProjectId'), projectTools.indexOf('export const createCreateProjectTool'));
    expect(fn.match(/if \(workspaceId\) q = q\.eq\('workspace_id', workspaceId\);/g) ?? []).toHaveLength(2);
    expect(fn, 'the owner check was dropped instead of joined').toMatch(/\.eq\('user_id', userId\)/);
  });

  it('the two list/search tools filter on it as well', () => {
    // "My projects" used to answer with every workspace the user belongs to, in one list.
    const listAndFind = projectTools.slice(projectTools.indexOf('export const createListMyProjectsTool'), projectTools.indexOf('export const createAddTaskTool'));
    expect(listAndFind.match(/eq\('workspace_id', workspaceId\)/g) ?? []).toHaveLength(2);
  });

  it('every project factory takes the workspace, and the binder passes it', () => {
    for (const factory of [
      'createCreateProjectTool', 'createListMyProjectsTool', 'createFindProjectTool',
      'createAddTaskTool', 'createAddPurchaseItemTool', 'createGeneratePurchaseSheetTool',
    ]) {
      const decl = projectTools.match(new RegExp(`export const ${factory} = \\(([\\s\\S]*?)\\) => \\{`));
      expect(decl, factory).not.toBeNull();
      expect(decl![1], factory).toContain('workspaceId');
      expect(agentChat, `${factory} is constructed without a workspace`)
        .toMatch(new RegExp(`${factory}\\(userId, workspaceId`));
    }
  });

  it('a client id supplied by the model is proven to be in this workspace', () => {
    // The `client_name` path always searched inside the workspace; the explicit-id path wrote a
    // body-supplied FK with a service-role client and checked nothing.
    const fn = projectTools.slice(projectTools.indexOf('export const createCreateProjectTool'), projectTools.indexOf('export const createListMyProjectsTool'));
    expect(fn).toMatch(/from\('crm_companies'\)\.select\('id'\)\s*\n?\s*\.eq\('id', companyId\)\.eq\('workspace_id', workspaceId\)/);
    expect(fn).toMatch(/from\('crm_contacts'\)\.select\('id'\)\s*\n?\s*\.eq\('id', contactId\)\.eq\('workspace_id', workspaceId\)/);
    expect(fn).toMatch(/was not found in this workspace/);
  });

  it('rooms that could not be added are reported, not silently zero', () => {
    const fn = projectTools.slice(projectTools.indexOf('export const createCreateProjectTool'), projectTools.indexOf('export const createListMyProjectsTool'));
    expect(fn).toMatch(/roomsError/);
    expect(fn, 'the insert error is discarded again').not.toMatch(/if \(!rErr\) roomCount = rooms\.length;/);
  });
});

describe('#395 — an expense whose payment failed is still an expense', () => {
  it('the payment leg is reported, not thrown', () => {
    // Throwing rejected the whole call for a bill that exists, and the obvious next turn books
    // the cost and the cash-out twice. Same defect as #351 C3, on the agent surface.
    const fn = expenseTools.slice(expenseTools.indexOf('export const createRecordExpenseTool'), expenseTools.indexOf('// ───────────────────────────── pay_expense'));
    expect(fn).toMatch(/let paymentError: string \| null = null;/);
    expect(fn).toMatch(/catch \(payErr: any\)/);
    expect(fn).toMatch(/const reallyPaid = Boolean\(paid\) && !paymentError;/);
    expect(fn).toMatch(/Do NOT record the expense again/);
    // The RPC's own `throw` is fine — what matters is that it lands in the LOCAL catch and not in
    // the tool's outer one, which is what turned a committed bill into a reported failure.
    const rpcThrow = fn.indexOf('if (rp.error) throw rp.error;');
    const localCatch = fn.indexOf('catch (payErr: any)');
    expect(rpcThrow).toBeGreaterThan(-1);
    expect(localCatch).toBeGreaterThan(rpcThrow);
    expect(fn.slice(rpcThrow, localCatch)).not.toContain('return JSON.stringify');
  });
});

describe('#395 — the same shape in two more user-owned tables', () => {
  it('a tracked mention subject is resolved inside this workspace', () => {
    const fn = mentionTools.slice(mentionTools.indexOf('async function resolveSubjectBase'), mentionTools.indexOf('async function callMivaa'));
    expect(fn).toMatch(/workspaceId: string \| null,/);
    // All three reads it makes: the product check, the uuid lookup and the label search.
    expect(fn.match(/eq\('workspace_id', workspaceId\)/g) ?? []).toHaveLength(3);
    expect(fn, 'the owner check was replaced rather than joined').toMatch(/\.eq\('user_id', userId\)/);
  });

  it('and a product id from the model is proven before it reaches MIVAA', () => {
    // `callMivaa` sends the SERVICE-ROLE key when no user JWT is passed, so an unchecked uuid
    // travelled upstream under service-role authority.
    const fn = mentionTools.slice(mentionTools.indexOf('async function resolveSubjectBase'), mentionTools.indexOf('async function callMivaa'));
    const check = fn.indexOf("from('products')");
    const build = fn.indexOf('/api/v1/mention-monitoring/products/');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(build);
    expect(fn).toMatch(/in this workspace/);
  });

  it('a tracked job search is resolved inside this workspace', () => {
    const fn = jobTools.slice(jobTools.indexOf('async function findUserTrackedJobByLabel'));
    expect(fn.slice(0, 900)).toMatch(/workspaceId: string \| null, label: string/);
    expect(fn.slice(0, 900)).toMatch(/if \(workspaceId\) q = q\.eq\('workspace_id', workspaceId\);/);
    expect(jobTools).toMatch(/if \(workspaceId\) tq = tq\.eq\('workspace_id', workspaceId\);/);
  });

  it('every factory in both files takes the workspace, and the binder passes it', () => {
    const byFile: Array<[string, string, string[]]> = [
      ['mention', mentionTools, ['createGetMentionSummaryTool', 'createFindNegativeMentionsTool', 'createCheckLlmVisibilityTool', 'createTrackProductMentionsTool']],
      ['job', jobTools, ['createTrackJobSearchTool', 'createListMyJobSearchesTool', 'createFindJobsTool', 'createManageJobSitesTool', 'createGetJobDigestPreviewTool']],
    ];
    for (const [label, src, factories] of byFile) {
      for (const factory of factories) {
        const decl = src.match(new RegExp(`export const ${factory} = \\(([\\s\\S]*?)\\) => \\{`));
        expect(decl, `${label}/${factory}`).not.toBeNull();
        expect(decl![1], `${label}/${factory}`).toContain('workspaceId');
        expect(agentChat, `${factory} is constructed without a workspace`)
          .toMatch(new RegExp(`${factory}\\(userId, workspaceId`));
      }
    }
  });
});
