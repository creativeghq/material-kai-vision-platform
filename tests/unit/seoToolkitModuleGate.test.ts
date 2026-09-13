/**
 * The SEO toolkit is gated on the PAID MODULE, not on the admin role (#401).
 *
 * It was `if (isAdmin)` because "each call spends real DataForSEO credits on the platform's tab".
 * That is a spend concern, and a workspace that bought `seo-toolkit` bought the spend — the
 * handlers debit its own wallet. Gating on the role meant no ordinary member of a PAYING workspace
 * could use any of the 40 tools, which are exactly what the competing products sell to customers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const CHAT = read('supabase/functions/agent-chat/index.ts');
const CATALOG = read('src/components/features/ai/agentToolsCatalog.ts');

describe('the gate is the module', () => {
  it('resolves the entitlement and combines it with admin', () => {
    expect(CHAT).toMatch(/rpc\('is_workspace_entitled',\s*\{[\s\S]{0,120}?'seo-toolkit'/);
    expect(CHAT).toMatch(/const canUseSeo = isAdmin \|\| seoEntitled;/);
  });

  it('fails closed when the entitlement cannot be read', () => {
    // An entitlement we could not read is not a licence to spend someone else's credits.
    // `seoEntitled` is initialised false and only ever set on an explicit `true`.
    expect(CHAT).toMatch(/let seoEntitled = false;/);
    expect(CHAT).toMatch(/seoEntitled = entRow === true;/);
  });

  it('both SEO binder blocks use it, not isAdmin', () => {
    expect(CHAT).toMatch(/if \(canUseSeo\) \{/);
    expect(CHAT, 'the website-context resolve must follow the same gate, or a member gets tools with no site')
      .toMatch(/const needsSeoWebsiteCtx = canUseSeo &&/);
    expect(CHAT, 'the old role gate should be gone from the SEO section')
      .not.toContain('end isAdmin SEO gate');
  });
});

describe('the raw escape hatch stays admin', () => {
  it('is bound behind isAdmin', () => {
    // It takes an ARBITRARY DataForSEO endpoint and params, so its spend is not what a workspace
    // bought when it bought the module. Every other tool is a named, costed operation.
    expect(CHAT).toMatch(/isAdmin && config\.tools\.includes\('seo_dataforseo_call'\)/);
  });

  it('is still marked adminOnly in the catalog', () => {
    const entry = /\{\s*\n\s*id: 'seo_dataforseo_call',[\s\S]*?\n\s*\},/.exec(CATALOG);
    expect(entry, 'seo_dataforseo_call entry missing').toBeTruthy();
    expect(entry![0]).toMatch(/adminOnly:\s*true/);
  });
});

describe('the toolkit is actually offered now', () => {
  it('the SEO clusters are no longer adminOnly', () => {
    // getAccessibleToolkits drops adminOnly clusters for a member, so leaving the flag on would
    // keep the whole toolkit invisible however the binder is gated.
    for (const id of ['seo-research', 'seo-domain', 'seo-backlinks', 'seo-content', 'seo-article']) {
      const m = new RegExp(`id: '${id}',[\\s\\S]{0,700}?tool_ids:`).exec(CATALOG);
      expect(m, `cluster ${id} not found`).toBeTruthy();
      expect(m![0], `cluster ${id} is still adminOnly`).not.toMatch(/adminOnly:\s*true/);
    }
  });

  it('the article pipeline is reachable too', () => {
    // These five sat inside the SUB-AGENT admin block, a different one from the toolkit's, so the
    // first fix would have left the whole pipeline offered-and-unbound.
    for (const t of ['seo_keyword_research', 'seo_article_planner', 'seo_article_writer',
      'seo_content_analyzer', 'create_seo_article']) {
      const m = new RegExp(`\\{\\s*\\n\\s*id: '${t}',[\\s\\S]*?\\n\\s*\\},`).exec(CATALOG);
      expect(m, `${t} entry missing`).toBeTruthy();
      expect(m![0], `${t} is still adminOnly`).not.toMatch(/adminOnly:\s*true/);
    }
  });
});
