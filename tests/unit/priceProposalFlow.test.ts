import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const TOOLS = read('supabase/functions/_shared/tools/price-tools.ts');
const DRAWER = read('src/components/features/pricing/PriceLookupDrawer.tsx');
const AGENT_CHAT = read('supabase/functions/agent-chat/index.ts');

describe('KB price lookup → proposal flow', () => {
  it('a proposal is emitted by a tool call, never requested as a free-text "chunk"', () => {
    expect(TOOLS).not.toMatch(/Emit a `price_proposal` chunk/);
    expect(TOOLS).toMatch(/name: 'submit_price_proposal'/);
    expect(TOOLS).toMatch(/onChunk\?\.\(proposal\)/);
  });

  it('the platform applies the discount cascade, not the model', () => {
    const body = TOOLS.slice(TOOLS.indexOf('createSubmitPriceProposalTool'));
    expect(body).toMatch(/for \(const d of supplier_discount_percents/);
    expect(body).toMatch(/price \* \(1 - d \/ 100\)/);
    expect(body).not.toMatch(/final_unit_price: z\./);
  });

  it('cited documents are verified against the caller workspace', () => {
    const body = TOOLS.slice(TOOLS.indexOf('createSubmitPriceProposalTool'));
    expect(body).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(body).toMatch(/\.in\('id', ids\)/);
  });

  it('procurement cost lists never reach a quote price lookup', () => {
    expect(TOOLS).toMatch(/price_doc_type !== 'supplier_cost_list'/);
  });

  it('the drawer renders what agent-chat actually streams', () => {
    expect(AGENT_CHAT).toMatch(/type: 'final_result'/);
    expect(DRAWER).toMatch(/case 'text_delta'/);
    expect(DRAWER).toMatch(/case 'final_result'/);
    expect(DRAWER).toMatch(/case 'price_proposal'/);
  });

  it('every document type has a label and the badge cannot render "undefined"', () => {
    expect(DRAWER).toMatch(/supplier_cost_list: 'Supplier cost list'/);
    expect(DRAWER).toMatch(/DOC_TYPE_LABEL\[m\.doc_type\] \?\? DOC_TYPE_LABEL\.unknown/);
  });

  it('the tool is bound for the agents that list price_lookup', () => {
    const listed = (AGENT_CHAT.match(/'price_lookup'/g) ?? []).length;
    const proposal = (AGENT_CHAT.match(/'submit_price_proposal'/g) ?? []).length;
    expect(proposal).toBeGreaterThanOrEqual(3);
    expect(listed).toBeGreaterThanOrEqual(3);
  });
});
