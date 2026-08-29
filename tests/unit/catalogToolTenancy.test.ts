/**
 * A catalog belongs to a workspace, and the tool that opens it has to know which (#395).
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
