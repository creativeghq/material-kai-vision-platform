// GENERATED MIRROR of src/config/platformApiAccess.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

// Which of the platform's own edge endpoints an agent may call on the user's behalf, and which
// ones stop for a human first.
//
// The agent carries the USER'S JWT, so authorization is not decided here — each edge function
// declares its own auth and validates its own body (invariant 5). Anything reachable through
// `call_platform_api` was already reachable by that user with curl. What this file decides is the
// much smaller question of which calls a MODEL should not make unattended.

/** An endpoint an agent must never call, whatever the caller's rights. */
export interface BlockedEndpoint {
  name: string;
  /** Why. Shown to the model so it can say something useful instead of retrying. */
  reason: string;
}

/**
 * NEVER callable. Not a permission — the caller is usually entitled to all of these. They are
 * excluded because a model firing them unattended does damage no permission check would call
 * wrong: unbounded recursion, a bulk job over live data, or a queue that exists to be worked by
 * a human.
 */
export const PLATFORM_API_BLOCKED: readonly BlockedEndpoint[] = [
  { name: 'agent-chat', reason: 'This is the agent runtime itself — calling it would recurse without bound.' },
  { name: 'agent-eval', reason: 'Spends a real agent turn per case. The eval harness is run by the operator.' },
  { name: 'reset-platform', reason: 'Wipes workspace data — there is no undo.' },
  { name: 'platform-secrets-admin', reason: 'Reads and writes platform credentials.' },
  {
    name: 'data-integrity-runner',
    reason: 'Runs the integrity sweep, including heals. A heal that moves goods, money or documents '
      + 'is not something an agent triggers on its own.',
  },
  {
    name: 'finance-inbound-sync',
    reason: 'Can auto-approve pending warehouse items straight into stock. That queue holds real '
      + 'un-actioned deliveries and is worked by a person.',
  },
  { name: 'background-agent-runner', reason: 'Spawns background agent runs; scheduled by the operator.' },
  { name: 'xml-import-orchestrator', reason: 'Bulk supplier import — creates and updates products at scale.' },
  { name: 'crm-company-embedding-backfill', reason: 'Bulk embedding backfill over every company in the CRM.' },
  { name: 'kb-embedding-backfill', reason: 'Bulk backfill over the whole knowledge base.' },
  { name: 'trigger-factory-enrichment', reason: 'Bulk enrichment across the whole product catalogue.' },
  { name: 'taric-reference-sync', reason: 'Bulk sync of the whole TARIC customs reference set.' },
  { name: 'revolut-sync', reason: 'Bulk bank-feed sync; the reconciliation it feeds is per-leg and manual.' },
  { name: 'check-material-alerts', reason: 'A scheduled job body — it runs on its own timetable.' },
  { name: 'page-watches', reason: 'A scheduled job body — it runs on its own timetable.' },
  { name: 'finance-digest-aggregate', reason: 'A scheduled job body — it runs on its own timetable.' },
  { name: 'notification-dispatcher', reason: 'Fans out notifications to people. Emit a flow event instead.' },
  {
    name: 'mivaa-gateway',
    // The limit of per-endpoint classification, stated rather than hidden: this is a PROXY over
    // another backend's ~100 actions — including deletes and bulk RAG jobs — so one verdict here
    // cannot mean anything about what an individual call does. Blocking the named bulk endpoints
    // one by one while leaving a dispatcher open is a gate with a door beside it.
    reason: 'A proxy over another backend whose individual actions this gate cannot see. The '
      + 'document and material capabilities it fronts have dedicated tools already.',
  },
];

/**
 * Callable, but the user approves first (invariant 9).
 *
 * The test is not "is this expensive" and not "does the role allow it" — generation tools cost
 * credits and are ungated today, and gating on entitlement here would just re-impose the limit
 * this tool exists to remove. It is: does this MOVE MONEY, FILE with an authority, or REACH A
 * THIRD PARTY. Each of those is unreversible by us, and a retried call does it twice.
 */
export const PLATFORM_API_CONFIRM: readonly BlockedEndpoint[] = [
  // Filed with ΑΑΔΕ — a transmitted document carries a legal number and cannot be withdrawn.
  { name: 'finance-issue-invoice', reason: 'Issues and transmits a fiscal document to ΑΑΔΕ.' },
  { name: 'finance-mydata-book', reason: 'Files the myDATA aggregate book with ΑΑΔΕ.' },
  // Money.
  { name: 'finance-send-payment', reason: 'Instructs a real transfer out of the bank account.' },
  { name: 'finance-pay-invoice', reason: 'Opens a payment session against an invoice.' },
  { name: 'stripe-api', reason: 'Moves real money through the Stripe account.' },
  { name: 'stripe-connect', reason: 'Changes the workspace payment account.' },
  { name: 'revolut-api', reason: 'Acts directly on the business bank account.' },
  // Reaches a customer or the public.
  { name: 'finance-send-invoice-email', reason: 'Sends an email to the customer named on the invoice.' },
  { name: 'finance-send-statement', reason: 'Emails a customer their account statement.' },
  { name: 'send-quote-email', reason: 'Emails the quote out to its recipient.' },
  { name: 'catalog-send-to-customers', reason: 'Sends a catalog to a list of CRM recipients.' },
  { name: 'email-api', reason: 'Sends email out under the workspace name.' },
  { name: 'messaging-api', reason: 'Sends a message that reaches a customer directly.' },
  { name: 'inbox-api', reason: 'Can reply to a customer conversation.' },
  { name: 'zernio-api', reason: 'Publishes to a connected channel the public can see.' },
  { name: 'pinterest-api', reason: 'Publishes to a public profile where anyone can see it.' },
  { name: 'workspace-webhooks-api', reason: 'Delivers workspace data to an external endpoint.' },
  { name: 'trade-portal', reason: 'Acts on the portal a supplier sees on their side.' },
  { name: 'tender-bid-portal', reason: 'Acts on a tender counterparty portal.' },
  { name: 'contracts-api', reason: 'Can send a contract out for signature.' },
  // Filed with ΕΡΓΑΝΗ, and changes an employment record.
  { name: 'hr-api', reason: 'Can file with ΕΡΓΑΝΗ and change employment records.' },
  // Privilege.
  { name: 'role-upgrade-requests', reason: 'Changes what an account is permitted to do.' },
  // Runs the automations that DO the fanout notification-dispatcher is blocked for — emails,
  // WhatsApp, bells — under the service role. Blocking the dispatcher and leaving this open
  // would gate the messenger and not the message.
  { name: 'flow-engine', reason: 'Runs a workspace automation, which can email or message people.' },
];

const BLOCKED = new Set(PLATFORM_API_BLOCKED.map((e) => e.name));
const CONFIRM = new Set(PLATFORM_API_CONFIRM.map((e) => e.name));

export type PlatformApiAccess =
  | { access: 'blocked'; reason: string }
  | { access: 'confirm'; reason: string }
  | { access: 'open' };

/** How may the agent call this endpoint? Unlisted means open — the deny list is the exception. */
export function platformApiAccess(name: string): PlatformApiAccess {
  const blocked = PLATFORM_API_BLOCKED.find((e) => e.name === name);
  if (blocked) return { access: 'blocked', reason: blocked.reason };
  const confirm = PLATFORM_API_CONFIRM.find((e) => e.name === name);
  if (confirm) return { access: 'confirm', reason: confirm.reason };
  return { access: 'open' };
}

/** Every endpoint named here, for the guard test that checks each one still exists. */
export function classifiedEndpointNames(): string[] {
  return [...BLOCKED, ...CONFIRM].sort();
}
