/**
 * What a human SAYS they did never becomes what the provider CONFIRMED: an acknowledgement that
 * could write `status` lets a workspace declare itself registered with ΑΑΔΕ on its own say-so.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../helpers/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const EDGE = 'supabase/functions/novus-onboarding/index.ts';
const WEBHOOK = 'supabase/functions/novus-onboarding-webhook/index.ts';
const CARD = 'src/modules/finance/components/EInvoiceOnboardingCard.tsx';
const STEPS = 'src/config/onboardingSteps.ts';
const SETUP = 'src/services/onboardingService.ts';

function branch(src: string, action: string): string {
  const head = src.indexOf(`if (action === '${action}')`);
  expect(head, `no "${action}" branch in the edge function`).toBeGreaterThan(-1);
  const open = src.indexOf('{', head);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in the "${action}" branch`);
}

describe('an acknowledgement is a claim, not a verdict', () => {
  it('writes only ack_* columns', () => {
    const body = branch(read(EDGE), 'acknowledge');
    // A Novus-owned column appearing in the patch is the whole bug.
    const assigned = [...body.matchAll(/\[?`?([a-z_]+)(?:_at|_by)?`?\]?:/g)].map((m) => m[1]);
    for (const forbidden of ['status', 'provisioning_status', 'aade_statement_status', 'request_type', 'contract_signed_version']) {
      expect(body.includes(`${forbidden}:`), `acknowledge must not write ${forbidden}`).toBe(false);
    }
    expect(assigned.length).toBeGreaterThan(0);
  });

  it('only the three manual steps can be acknowledged, and each maps to an ack_ column', () => {
    const src = read(EDGE);
    const map = src.slice(src.indexOf('const ACK_COLUMNS'), src.indexOf('};', src.indexOf('const ACK_COLUMNS')));
    const pairs = [...map.matchAll(/(\w+):\s*'([^']+)'/g)];
    expect(pairs.map((p) => p[1]).sort()).toEqual(['contract_delivered', 'contract_signed', 'statement_accepted']);
    for (const [, , column] of pairs) expect(column.startsWith('ack_')).toBe(true);
  });

  it('the card labels a self-reported step as unconfirmed', () => {
    const card = read(CARD);
    expect(card).toContain('self-reported');
    expect(card).toMatch(/confirmed_by\s*!==\s*'novus'/);
  });
});

describe('the webhook is a nudge, not the record', () => {
  it('verifies the signature before it touches the database', () => {
    const src = read(WEBHOOK);
    const verify = src.indexOf('Bad signature');
    const firstWrite = Math.min(
      ...['.insert(', '.update(', '.upsert('].map((op) => {
        const at = src.indexOf(op);
        return at === -1 ? Number.MAX_SAFE_INTEGER : at;
      }),
    );
    expect(verify).toBeGreaterThan(-1);
    // A check after the side effect is not a check.
    expect(verify).toBeLessThan(firstWrite);
  });

  it('fails closed when no signing secret is configured', () => {
    const src = read(WEBHOOK);
    const guard = src.indexOf('if (!secret)');
    expect(guard).toBeGreaterThan(-1);
    expect(src.slice(guard, guard + 220)).toContain('503');
  });

  it('re-reads the request from Novus rather than trusting the payload', () => {
    const src = read(WEBHOOK);
    expect(src).toMatch(/fetch\(`\$\{baseUrl\}\/api\/v1\/requests\//);
    expect(src).not.toMatch(/status:\s*payload/);
  });
});

describe('the onboarding step is ticked by the provider, not by the reader', () => {
  it('Start Here asks the derivation for the verdict', () => {
    const setup = read(SETUP);
    expect(setup).toContain('get_einvoice_onboarding');
    expect(setup).toMatch(/can_transmit/);
    const line = setup.slice(setup.indexOf('einvoicing:'), setup.indexOf('einvoicing:') + 200);
    expect(line).not.toContain('seen');
  });

  it('is the first setup step and is gated to whoever can act on it', () => {
    const src = read(STEPS);
    const ids = [...src.matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]);
    expect(ids[0]).toBe('einvoicing');
    const step = src.slice(src.indexOf("id: 'einvoicing'"), src.indexOf("id: 'business'"));
    expect(step).toContain('requireWorkspaceManager: true');
    expect(step).toContain("requireCapability: 'finance.manage'");
  });
});

describe('the application is built field by field', () => {
  it('never spreads the request body into the row', () => {
    const body = branch(read(EDGE), 'save_application');
    expect(body).not.toMatch(/\.\.\.body/);
    expect(body).toContain('workspace_id: workspaceId');
  });

  it('replays the stored idempotency key rather than minting one per attempt', () => {
    const body = branch(read(EDGE), 'create');
    expect(body).toContain('idempotencyKey: draft.idempotency_key');
    expect(body).not.toMatch(/idempotencyKey:\s*crypto\.randomUUID/);
  });
});
