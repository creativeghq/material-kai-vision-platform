import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const read = (p: string) => blankComments(
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'),
);

const EMBED = read('supabase/functions/products-3d-api/index.ts');
const STORE = read('supabase/functions/finance-storefront/index.ts');
const QUOTES = read('src/modules/quotes/services/QuotesService.ts');

describe('a lead from a stranger reaches a person', () => {
  it('the embed quote request emits, so the row does not just wait to be found', () => {
    expect(EMBED).toMatch(/emitFlowEventToWorkspaceRoles\(\s*workspaceId,[\s\S]{0,120}'quote_requested'/);
  });

  it('the storefront order emits — unpaid, no later event ever fires', () => {
    expect(STORE).toMatch(/emitFlowEventToWorkspaceRoles\(ws\.id,[\s\S]{0,80}'order_created'/);
  });

  it('a notification failure never fails a checkout the customer completed', () => {
    const emit = STORE.indexOf("'order_created'");
    const around = STORE.slice(emit - 400, emit + 800);
    expect(around, 'the emit must be inside a try/catch').toMatch(/try \{[\s\S]*catch/);
  });
});

describe('every quote_requested payload carries the workspace', () => {
  it('both emitters stamp workspace_id, or a tenant flow can never match', () => {
    const emits = [...QUOTES.matchAll(/flowEventService\.emit\('quote_requested',\s*\{([\s\S]*?)\}\);/g)];
    expect(emits.length, 'expected both quote_requested emitters').toBe(2);
    for (const [, body] of emits) {
      expect(body, 'a payload without workspace_id matches only is_global flows')
        .toMatch(/workspace_id:/);
    }
  });

  it('the embed payload stamps it too', () => {
    const emit = EMBED.indexOf("'quote_requested'");
    expect(EMBED.slice(emit, emit + 600)).toMatch(/workspace_id: workspaceId/);
  });
});
