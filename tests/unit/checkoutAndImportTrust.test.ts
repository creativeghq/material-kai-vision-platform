/**
 * The server decides what a subscription costs, and a Pinterest URL is a Pinterest URL
 * (#360 CB-12 / CB-10) — plus the BYOK panel stops promising a fallback that does not exist
 * (#360 CB-1 / CB-2 / CB-4).
 *
 * CB-12: `price: priceId` took the Stripe price id straight from the request body, so a caller
 * could name any price on the platform's Stripe account. `subscription_plans` already holds the
 * answer and `crm-api`'s handler already reads it that way — same defect as FE-23 in #351.
 *
 * CB-10: `extractPinId` matched `/pinterest\.com\/pin\/(\d+)/` ANYWHERE in the string, so
 * `https://attacker.test/?ref=pinterest.com/pin/123` passed as a pin. A substring test standing
 * in for a host test.
 *
 * CB-1/CB-2: the Keys panel said *"Leave blank to use the platform defaults"* — which both
 * backends contradict in their own comments. A wrong mental model is worse than a silent bug,
 * because the tenant acts on it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const checkout = read('supabase/functions/stripe-api/handlers/checkout.ts');

/**
 * The `type === 'subscription'` branch, anchored FORWARD to the next `} else {`.
 *
 * Slicing to the first `} else {` in the file finds the customer-id block, which sits ABOVE this
 * branch — so the slice came back empty and every assertion in it passed over nothing. The
 * earlier-occurrence trap, which is why the length check is here too.
 */
function subscriptionBranch(): string {
  const start = checkout.indexOf("} else if (type === 'subscription')");
  expect(start).toBeGreaterThan(-1);
  const body = checkout.slice(start, checkout.indexOf('} else {', start));
  expect(body.length).toBeGreaterThan(400);
  return body;
}
const pinImport = read('supabase/functions/pinterest-api/handlers/import.ts');
const keysTab = read('src/components/core/Profile/WorkspaceKeysTab.tsx');
const stripeSvc = read('src/services/stripe.service.ts');

describe('#360 CB-12 — the price comes from our plans, not from the browser', () => {
  it('the subscription branch looks the plan up', () => {
    const branch = subscriptionBranch();
    expect(branch).toMatch(/from\('subscription_plans'\)/);
    expect(branch).toMatch(/\.eq\('is_active', true\)/);
    expect(branch).toMatch(/price: plan\.stripe_price_id/);
    expect(branch, 'the body price id is charged again').not.toMatch(/price: priceId/);
  });

  it('an unknown plan is refused rather than charged', () => {
    const branch = subscriptionBranch();
    expect(branch).toMatch(/code: 'unknown_plan'/);
  });

  it('a contact-sales plan has no self-serve checkout', () => {
    const branch = subscriptionBranch();
    expect(branch).toMatch(/code: 'contact_sales'/);
  });

  it('a failed plan read stops checkout instead of falling through', () => {
    const branch = subscriptionBranch();
    expect(branch).toMatch(/if \(plansErr\)[\s\S]{0,200}503/);
  });

  it('the legacy price id is a LOOKUP, not a trust', () => {
    // Still accepted so an older client keeps working — but only when it matches an active plan's
    // stored price id, which makes it a way of naming a plan rather than a way of naming a price.
    const branch = subscriptionBranch();
    expect(branch).toMatch(/activePlans\.find\(\(pl\) => pl\.stripe_price_id === priceId\)/);
  });

  it('the client sends a plan id', () => {
    expect(stripeSvc).toMatch(/createSubscriptionCheckoutSession\(\s*planId: string,?\s*\)/);
    expect(stripeSvc).toMatch(/type: 'subscription',\s*\n\s*planId,/);
    expect(stripeSvc, 'the bundled price id is posted again').not.toMatch(/type: 'subscription',\s*\n\s*priceId,/);
  });

  it('the plan the server chose travels on the subscription metadata', () => {
    // So the webhook can settle the tier from OUR record instead of re-deriving it from a price
    // id it has to recognise — which is how an unknown price silently became `free`.
    const branch = subscriptionBranch();
    expect(branch).toMatch(/plan_id: plan\.id/);
  });
});

describe('#360 CB-10 — a pin URL is checked by HOST', () => {
  it('the host pattern replaced the substring match', () => {
    expect(pinImport).toMatch(/const PINTEREST_HOST =/);
    expect(pinImport).toMatch(/function parsePinterestUrl/);
    expect(pinImport, 'the anywhere-in-the-string match is back')
      .not.toMatch(/pinUrl\.match\(\/pinterest/);
  });

  it('the pin id comes from the parsed path, not from a regex over the whole string', () => {
    expect(pinImport).toMatch(/url\.pathname\.match\(\/\^\\\/pin\\\/\(\\d\+\)\/\)/);
  });

  it('an unparseable or foreign URL is refused before anything is fetched', () => {
    const fn = pinImport.slice(pinImport.indexOf('async function extractPinData'), pinImport.indexOf('const res = await fetch(oembedUrl)'));
    expect(fn).toMatch(/if \(!parsed\)/);
    expect(fn).toMatch(/not a Pinterest pin URL/);
  });

  it('the NORMALISED url is what travels to the provider', () => {
    expect(pinImport).toMatch(/encodeURIComponent\(parsed\.url\.toString\(\)\)/);
  });

  it('the image download is still SSRF-guarded, with redirects refused', () => {
    // The half that was already right — it is the one that fetches on OUR infrastructure.
    expect(pinImport).toMatch(/await assertSafeUrl\(imageUrl\)/);
    expect(pinImport).toMatch(/redirect: 'error'/);
  });
});

describe('#360 CB-1/CB-2 — the Keys panel tells the truth', () => {
  it('the platform-defaults promise is gone', () => {
    // Both backends contradict it: `_shared/aade/soap.ts` says tenants never use the operator's
    // master credentials, and `resolveWorkspaceEmailSender` exempts only a system send and the
    // operator's own root workspace.
    expect(keysTab, 'the platform-defaults promise is back')
      .not.toMatch(/Leave blank to use the platform defaults/);
  });

  it('the rule is stated once, above every section', () => {
    expect(keysTab).toMatch(/const ByokRuleNote/);
    expect(keysTab).toMatch(/<ByokRuleNote \/>/);
    expect(raw('src/components/core/Profile/WorkspaceKeysTab.tsx')).toMatch(/Nothing here falls back to ours/);
  });

  it('the email section says what blank actually means', () => {
    expect(keysTab).toMatch(/this workspace sends no email/);
  });
});

describe('#360 CB-4 — credential entry is owner/admin work', () => {
  it('the panel gates on the workspace role', () => {
    expect(keysTab).toMatch(/if \(!isAdmin\(workspaceRole\)\)/);
    expect(keysTab).toMatch(/const \{ activeWorkspaceId, workspaceRole \} = useWorkspace\(\)/);
  });

  it('the gate precedes every card', () => {
    const gate = keysTab.indexOf('if (!isAdmin(workspaceRole))');
    const render = keysTab.indexOf('const renderSection');
    expect(gate).toBeGreaterThan(-1);
    expect(gate < render, 'the cards render before the role is checked').toBe(true);
  });

  it('it explains rather than just refusing', () => {
    expect(raw('src/components/core/Profile/WorkspaceKeysTab.tsx'))
      .toMatch(/Ask an owner to set them up/);
  });
});
