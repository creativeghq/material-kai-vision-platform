// Where the platform's own places ARE — one registry, so naming a place and linking to it are
// the same act.
//
// Two dead ends this exists to close, both seen on the Social quick-start:
//
//   1. A reply that ends "connect one in Profile → Social Accounts" names a destination and then
//      leaves the reader to go find it. Mentioning a place without linking to it is the text
//      equivalent of an empty state with no way out of being empty.
//   2. A result card that offers "Add account" under a list of connected accounts hands the
//      intent back to the model — and the model cannot connect an account, because that is an
//      OAuth handshake that only exists in the app UI. What comes back is prose about where to
//      go, which is dead end #1 again, one turn later.
//
// Both are fixed by the same fact: this is where that place lives. Read by
// `linkifyDestinations()` (agent replies), `AgentResultCard` (the setup action on a result card)
// and `RESULT_SETUP_DESTINATION` in `capabilities.ts`.
//
// A route here is a promise the app keeps — `tests/unit/agentReplyDestinations.test.ts` fails the
// build when one points at a route or a tab that does not exist, because a link to nowhere is
// worse than the mention it replaced.

import { FINANCE_BASE, FINANCE_TAB } from '@/modules/finance/routes';

export interface AppDestination {
  /** Stable id — what a result card / capability refers to the place by. */
  id: string;
  /**
   * The platform's own name for the place, spelled the way a reply says it out loud:
   * "Profile → Social Accounts". Matching is case-insensitive and separator-agnostic, so
   * `Profile -> social accounts` and `Profile > Social Accounts` all resolve here.
   *
   * MUST have at least two segments. A one-word destination ("Inbox") cannot be linkified
   * without swallowing every ordinary sentence that happens to use the word.
   */
  breadcrumb: string;
  /** In-app route, including any `?tab=` the destination needs to actually land on it. */
  route: string;
  /** Other names the same place goes by, matched exactly like `breadcrumb`. */
  aliases?: string[];
}

export const APP_DESTINATIONS: readonly AppDestination[] = [
  // ── Profile (the tenant's own settings; every tab here is a `TabsTrigger` value in
  //    `src/pages/UserProfilePage.tsx`, checked by the guard test) ──
  {
    id: 'social-accounts',
    breadcrumb: 'Profile → Social Accounts',
    route: '/profile?tab=social-accounts',
    // The workspace-wide overview page says it this way, and so do people.
    aliases: ['My Profile → Social Accounts', 'Settings → Social Accounts'],
  },
  { id: 'modules', breadcrumb: 'Profile → Modules', route: '/profile?tab=modules', aliases: ['Settings → Modules', 'Profile → Apps'] },
  { id: 'workspace-keys', breadcrumb: 'Profile → Keys', route: '/profile?tab=keys', aliases: ['Settings → Keys'] },
  { id: 'team', breadcrumb: 'Profile → Team', route: '/profile?tab=team' },
  // Calendar and Appointments are SECTIONS of the Schedule tab now, and the breadcrumb keeps
  // naming the section rather than the tab: a reply that says "Profile → Schedule" and lands on
  // Appointments would be the mismatch this file exists to remove. The tab's own name is the
  // alias, so prose spelling it that way still links somewhere real.
  {
    id: 'calendar',
    breadcrumb: 'Profile → Calendar',
    route: '/profile?tab=schedule&section=calendar',
    aliases: ['Profile → Schedule → Calendar', 'Profile → My Calendar'],
  },
  {
    id: 'appointments',
    breadcrumb: 'Profile → Appointments',
    route: '/profile?tab=schedule&section=appointments',
    aliases: ['Profile → Schedule → Appointments'],
  },
  {
    id: 'availability',
    breadcrumb: 'Profile → Availability',
    route: '/profile?tab=schedule&section=availability',
    aliases: ['Profile → Schedule → Availability', 'Profile → Appointment Availability'],
  },
  { id: 'websites', breadcrumb: 'Profile → Websites', route: '/profile?tab=websites' },
  { id: 'webhooks', breadcrumb: 'Profile → Webhooks', route: '/profile?tab=webhooks' },
  { id: 'credits', breadcrumb: 'Profile → Credits', route: '/profile?tab=credits' },
  { id: 'subscription', breadcrumb: 'Profile → Subscription', route: '/profile?tab=subscription' },
  { id: 'profile-reviews', breadcrumb: 'Profile → Reviews', route: '/profile?tab=reviews' },

  // ── Module pages ──
  // WhatsApp connect lives on the profile's channels rail, beside the social accounts — same
  // Zernio account, same mental model. `?section=whatsapp` is that rail's declared external
  // contract (SocialHubPanel), not one of its internal section names. `/messaging` still exists
  // but is workspace-admin-gated, so it is the wrong place to send the person connecting.
  {
    id: 'messaging-channels',
    // The breadcrumb has to NAME where the link goes — a card that says "Messaging → Channels"
    // and lands on the profile is the same mismatch this file exists to remove. The old name
    // stays as an alias so prose still carrying it links to the surface that replaced it.
    breadcrumb: 'Profile → Social Accounts → WhatsApp',
    route: '/profile?tab=social-accounts&section=whatsapp',
    aliases: ['Messaging → Channels'],
  },
  {
    id: 'quote-requests',
    breadcrumb: 'Quotes → Requests',
    route: '/quotes?tab=requests',
    // `raise_quote_request` names the sub-tab it lands in; link the whole phrase rather than
    // half of it.
    aliases: ['Quotes → Requests → Incoming'],
  },
  // The Orders pane is keyed `doc_orders`, not `orders` — read from the module's own constant so
  // this cannot become the "valid URL, blank pane" link that FINANCE_TAB was written to stop.
  { id: 'finance-orders', breadcrumb: 'Finance → Orders', route: `${FINANCE_BASE}?tab=${FINANCE_TAB.orders}` },
  // Where a supplier invoice that arrived in the Inbox is booked. The attachment card links here.
  { id: 'finance-expenses', breadcrumb: 'Finance → Expenses', route: `${FINANCE_BASE}?tab=${FINANCE_TAB.expenses}`, aliases: ['Finance → Bills'] },
  { id: 'marketing-email', breadcrumb: 'Marketing → Email', route: '/marketing/email' },
  { id: 'automations', breadcrumb: 'Marketing → Automations', route: '/automations' },

  // ── Operator surfaces (admin-only pages; the link still resolves, the page guards itself) ──
  {
    id: 'background-tasks',
    breadcrumb: 'Admin → Background Tasks',
    route: '/admin/ai-configs?tab=background-agents',
    aliases: ['Admin → Background Agents'],
  },
  { id: 'admin-flows', breadcrumb: 'Admin → Flows', route: '/flows' },
];

const BY_ID = new Map(APP_DESTINATIONS.map((d) => [d.id, d]));

export function getDestination(id: string): AppDestination | undefined {
  return BY_ID.get(id);
}

/** The route for a destination id, or null when nothing is registered under that id. */
export function destinationRoute(id: string): string | null {
  return BY_ID.get(id)?.route ?? null;
}

/**
 * Every name a destination answers to (breadcrumb + aliases), paired with its route.
 * The linkifier builds its pattern from this; nothing else should need it.
 */
export function destinationPhrases(): Array<{ phrase: string; route: string }> {
  return APP_DESTINATIONS.flatMap((d) =>
    [d.breadcrumb, ...(d.aliases ?? [])].map((phrase) => ({ phrase, route: d.route })),
  );
}
