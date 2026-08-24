/**
 * Who WE are, and how the outside world reaches us — for an assistant that speaks on our behalf.
 *
 * ── Why this file exists ────────────────────────────────────────────────────────────────────
 * On 2026-08-24 a supplier asked the Inbox assistant, over WhatsApp, `your email address, please`.
 * It answered: *"I'm sorry, but I don't have an email address to share here."*
 *
 * That sentence was true about its own context and false about the platform. The whole context it
 * was given about the business it was answering for was one field — `workspaces.name`, which on
 * that workspace reads **"Default Workspace"**. Meanwhile the database held the trading name
 * (MATERIALS BANK ΕΕ), the VAT number, the street, the city, the ΚΑΔ profession, and a live
 * workspace mailbox that routes straight back into the same Inbox. The assistant could look up an
 * invoice balance to the cent and could not name the company it was invoicing for.
 *
 * ── The rule ────────────────────────────────────────────────────────────────────────────────
 * Any model turn that speaks AS the business gets the business identity, and it comes from the
 * same derivation the invoice does. `workspace_invoicing_identity(workspace_id)` (SQL, STABLE,
 * SECURITY DEFINER, service_role-only) is that derivation — it already prefers the `_en` copy of
 * every field, which is what a Chinese supplier or a German architect should be reading. There is
 * no TypeScript re-pick of `finance_settings.business_*` here, and there must not be one: that
 * column set is the identity transmitted to AADE, and a second reader of it is a second answer to
 * "who are we" (CLAUDE.md, "one derivation per quantity").
 *
 * ── Reachability is a LADDER, and it is not the same question as identity ────────────────────
 * `workspace_invoicing_identity` answers "what goes on the invoice" — a legal name, a VAT number,
 * and `business_email`, whose own placeholder in the UI is `billing@acme.gr`. Correct for a fiscal
 * document, wrong for a support conversation, and blank in either case means nobody typed it in
 * rather than that the business is unreachable. So email and phone continue down a ladder of
 * addresses that demonstrably work, most deliberate first:
 *
 *   email:  workspace_customer_contact → contact_email  ← "Contact email", `hello@acme.gr`: the
 *                                                         address the operator wants customers on
 *        →  workspace_customer_contact → business_email ← the billing address; writing to accounts
 *                                                         beats not reaching us at all
 *        →  workspace_email_config.reply_to   ← where we already ask people to answer us
 *        →  workspace_email_config.from_email ← where our mail visibly comes from
 *        →  user_email_addresses.full_address ← the workspace mailbox: a real routed address that
 *                                               files replies back onto the Inbox thread
 *        →  auth.users.email of the owner     ← LAST, and see the warning below
 *
 *   phone:  workspace_customer_contact (contact_phone → business_phone)
 *        →  the workspace's own connected WhatsApp number (`workspace_phone_numbers`)
 *
 * The first two rungs are ONE SQL call, because "which of the two columns the operator filled in"
 * is a derivation and belongs next to the other one. `workspace_customer_contact` is the
 * customer-facing twin of `workspace_invoicing_identity` and the two are deliberately separate:
 * teaching the invoicing one to prefer a support address would change what reaches AADE.
 *
 * The mailbox rung is the one that matters most in practice and it is strictly the best answer of
 * the five: it is on the business's own domain, and mail sent to it lands in the Inbox next to the
 * conversation that asked for it. A supplier who emails their invoice there gets it filed against
 * the thread instead of into a personal Gmail nobody in the workspace can see.
 *
 * ⚠️ THE LAST RUNG IS THE ACCOUNT LOGIN ADDRESS, and it is included on purpose and reluctantly.
 * It is a credential, not a business contact — publishing it to a counterparty is a decision the
 * operator never made. It sits last because the alternative measured worse: an assistant that says
 * "I don't have an email" while the platform demonstrably knows one is the failure that produced
 * this file, and every rung above it is under the operator's control. `emailSource` is returned so
 * a caller can see which rung answered, and so "we are quoting somebody's Gmail at suppliers"
 * cannot be a thing nobody noticed. Fill in Profile → Business and the ladder never reaches it.
 *
 * ── Absence stays absence ───────────────────────────────────────────────────────────────────
 * Every field is `null` when unknown, and `formatBusinessIdentityForPrompt` omits the line rather
 * than emitting a placeholder. A model handed `Email: unknown` invents one; a model handed no
 * email line falls through to the persona's escalation rule, which is the correct behaviour and
 * was the only correct part of the original answer.
 */
import type { DbClient } from './supabase-client.ts';

/** Which rung of the ladder produced the contact address. `null` when there is none. */
export type ContactSource =
  | 'customer_contact'
  | 'billing_contact'
  | 'email_reply_to'
  | 'email_from'
  | 'workspace_mailbox'
  | 'owner_account'
  | 'workspace_whatsapp'
  | null;

export interface BusinessIdentity {
  /** Trading name, `_en` preferred. Falls back to `workspaces.name` so this is never blank. */
  name: string;
  /** True when `name` is only the workspace label — nobody has filled in Profile → Business. */
  nameIsPlaceholder: boolean;
  email: string | null;
  emailSource: ContactSource;
  phone: string | null;
  phoneSource: ContactSource;
  website: string | null;
  /** Free text as the operator typed it ("Mon–Fri 9:00–17:00"). A top-three support question. */
  hours: string | null;
  /** One line: `street number, postalCode city` — whichever parts exist. */
  address: string | null;
  vatNumber: string | null;
  /** ΚΑΔ / line of business, `_en` preferred. Says WHAT we sell without a catalog lookup. */
  profession: string | null;
}

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  // Collapse the runs of spaces the AADE fields carry ("MATERIALS   BANK   ΕΕ").
  return s ? s.replace(/\s{2,}/g, ' ') : null;
};

/** `ΔΗΜΗΤΡΙΟΥ ΧΑΡΙΣΗ 12, 54352 ΘΕΣΣΑΛΟΝΙΚΗ` from whichever parts are filled in. */
function joinAddress(row: Record<string, unknown>): string | null {
  const street = [text(row.street), text(row.street_number)].filter(Boolean).join(' ');
  const city = [text(row.postal_code), text(row.city)].filter(Boolean).join(' ');
  const parts = [street, city].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Resolve the identity + reachability for one workspace. Never throws: an assistant losing its
 * "who am I" block must degrade to the old (wrong-but-safe) behaviour, not fail the whole turn.
 */
export async function resolveBusinessIdentity(
  db: DbClient,
  workspaceId: string,
): Promise<BusinessIdentity> {
  const identity: BusinessIdentity = {
    name: '',
    nameIsPlaceholder: true,
    email: null,
    emailSource: null,
    phone: null,
    phoneSource: null,
    website: null,
    hours: null,
    address: null,
    vatNumber: null,
    profession: null,
  };

  // 1. The invoicing identity — the SAME derivation the invoice and the myDATA envelope use.
  try {
    const { data } = await db.rpc('workspace_invoicing_identity', { p_workspace_id: workspaceId });
    const row = (data || {}) as Record<string, unknown>;
    identity.name = text(row.name) || '';
    identity.nameIsPlaceholder = !identity.name;
    identity.website = text(row.website);
    identity.vatNumber = text(row.vat_number);
    identity.profession = text(row.profession);
    identity.address = joinAddress(row);
  } catch (e) {
    console.warn('[business-identity] invoicing identity read failed:',
      e instanceof Error ? e.message : String(e));
  }

  // 2. The CUSTOMER-facing contact block — the twin derivation. `email_is_billing` says which of
  //    the two columns answered, so "we are handing suppliers the accounts inbox" is visible.
  try {
    const { data } = await db.rpc('workspace_customer_contact', { p_workspace_id: workspaceId });
    const row = (data || {}) as Record<string, unknown>;
    identity.email = text(row.email);
    identity.emailSource = identity.email
      ? (row.email_is_billing === true ? 'billing_contact' : 'customer_contact')
      : null;
    identity.phone = text(row.phone);
    identity.phoneSource = identity.phone ? 'customer_contact' : null;
    identity.hours = text(row.hours);
    // A customer-facing website beats the invoicing copy of the same field when both are set;
    // they read the same column today, and this keeps that true if one of them ever moves.
    identity.website = text(row.website) || identity.website;
    // The customer-facing BRAND, when the operator set one. A support reply signed with the trade
    // name is right where the legal name ("… ΕΕ", "… ΙΚΕ") reads like a letter from a lawyer.
    const title = text(row.title);
    if (title) { identity.name = title; identity.nameIsPlaceholder = false; }
  } catch (e) {
    console.warn('[business-identity] customer contact read failed:',
      e instanceof Error ? e.message : String(e));
  }

  // 3. A name we can say out loud. "Default Workspace" is a poor one, but it is what the operator
  //    named the place, and it beats an assistant with no idea who it works for.
  if (!identity.name) {
    const { data: ws } = await db.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
    identity.name = text((ws as { name?: string } | null)?.name) || '';
  }

  // 4. Email ladder. Ordered most-deliberate first; see the header for why the last rung exists.
  if (!identity.email) {
    const { data: cfg } = await db.from('workspace_email_config')
      .select('reply_to, from_email').eq('workspace_id', workspaceId).maybeSingle();
    const row = (cfg || {}) as Record<string, unknown>;
    const replyTo = text(row.reply_to);
    const fromEmail = text(row.from_email);
    if (replyTo) { identity.email = replyTo; identity.emailSource = 'email_reply_to'; }
    else if (fromEmail) { identity.email = fromEmail; identity.emailSource = 'email_from'; }
  }
  if (!identity.email) {
    // The workspace mailbox. `agent_ref is null` keeps this to a HUMAN mailbox: an agent-owned
    // address is a robot's drop box, and handing it to a supplier as "our email" would route their
    // invoice to an automation instead of to a person.
    const { data: box } = await db.from('user_email_addresses')
      .select('full_address').eq('workspace_id', workspaceId)
      .eq('is_active', true).is('agent_ref', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    const addr = text((box as { full_address?: string } | null)?.full_address);
    if (addr) { identity.email = addr; identity.emailSource = 'workspace_mailbox'; }
  }
  if (!identity.email) {
    // Last rung — a login credential standing in for a business address. Logged every time, so
    // "why are we giving out a Gmail" is answerable without reading this file.
    // No `status` filter and no ordering, deliberately — the same read `inbox-api`'s
    // `workspaceOwner` does. `workspace_members.status` is NULLABLE and the SQL side treats NULL
    // as active (`coalesce(wm.status, 'active')`), which PostgREST cannot express; filtering on
    // `status = 'active'` would therefore drop every legacy row and find no owner at all.
    const { data: owner } = await db.from('workspace_members')
      .select('user_id').eq('workspace_id', workspaceId)
      .in('role', ['owner', 'admin']).limit(1).maybeSingle();
    const ownerId = (owner as { user_id?: string } | null)?.user_id;
    if (ownerId) {
      // `user_profiles.email` is NULL for accounts created before it was populated, so the auth
      // record is the only reliable read. Both are tried; neither is preferred on freshness.
      const { data: prof } = await db.from('user_profiles')
        .select('email').eq('user_id', ownerId).maybeSingle();
      let addr = text((prof as { email?: string } | null)?.email);
      if (!addr) {
        const { data: au } = await db.auth.admin.getUserById(ownerId);
        addr = text(au?.user?.email);
      }
      if (addr) {
        identity.email = addr;
        identity.emailSource = 'owner_account';
        console.warn(
          `[business-identity] workspace ${workspaceId} has no business email — falling back to ` +
          `the owner's ACCOUNT address. Set one under Profile → Business.`,
        );
      }
    }
  }

  // 5. Phone ladder. The connected WhatsApp number is a real, staffed line the business publishes.
  if (!identity.phone) {
    const { data: num } = await db.from('workspace_phone_numbers')
      .select('phone_number').eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    const phone = text((num as { phone_number?: string } | null)?.phone_number);
    if (phone) { identity.phone = phone; identity.phoneSource = 'workspace_whatsapp'; }
  }

  return identity;
}

/**
 * The identity as a system-prompt block.
 *
 * A field we do not know emits NO line. That is deliberate: `Phone: unknown` in a system prompt is
 * an invitation to invent one, whereas an absent line leaves the persona's escalation rule ("a
 * team member will follow up") as the only available answer — which is correct.
 */
export function formatBusinessIdentityForPrompt(id: BusinessIdentity): string {
  const lines: string[] = [];
  if (id.name) lines.push(`Name: ${id.name}`);
  if (id.profession) lines.push(`Line of business: ${id.profession}`);
  if (id.email) lines.push(`Email: ${id.email}`);
  if (id.phone) lines.push(`Phone: ${id.phone}`);
  if (id.website) lines.push(`Website: ${id.website}`);
  if (id.hours) lines.push(`Opening hours: ${id.hours}`);
  if (id.address) lines.push(`Address: ${id.address}`);
  if (id.vatNumber) lines.push(`VAT number: ${id.vatNumber}`);
  if (!lines.length) return '';

  return `\n\n[OUR BUSINESS — this is who you are speaking for. These details are OURS to share.]\n`
    + lines.join('\n')
    + `\nShare any of the above when asked for it — an email address, a phone number, our company `
    + `name, where we are, or our VAT number are OUR OWN details, not customer data, and refusing `
    + `to give them is worse than useless.`
    + (id.nameIsPlaceholder
      ? `\nNote: our invoicing profile is not filled in, so the name above is only the workspace `
        + `label. Do not present it as the legal company name.`
      : '');
}
