/** My Profile's section rail — ONE declaration, read by the page that renders it. */
import {
  BadgeCheck, CalendarCheck, Coins, CreditCard, FileText, Globe, KeyRound, LayoutGrid,
  ReceiptText, Share2, Star, Truck, User, Users, Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ProfileTabId =
  | 'profile' | 'ambassador' | 'schedule' | 'reviews'
  | 'subscription' | 'credits' | 'billing' | 'documents'
  | 'social-accounts' | 'websites' | 'keys' | 'webhooks'
  | 'team' | 'modules' | 'supplier-portal';

export type ProfileGroupId = 'account' | 'connections' | 'workspace';
export type ProfileGateId = 'team' | 'modules' | 'supplierPortal';

export interface ProfileSection {
  /** The `?tab=` key — the external contract. Notification `action_url`s spell these. */
  value: ProfileTabId;
  label: string;
  icon: LucideIcon;
  group?: ProfileGroupId;
  /** The pane the page opens on. Exactly one section carries it. */
  landing?: boolean;
  /** Hidden unless the page answers yes. On the SECTION, so every reader applies the same gate. */
  gate?: ProfileGateId;
}

export const PROFILE_SECTION_GROUPS = {
  account: 'Account & billing',
  connections: 'Connections',
  workspace: 'Workspace',
} as const;

/**
 * Fifteen panes in four runs. Fifteen triggers in one `flex-wrap` row is not a tab strip — it is
 * three lines of pills mixing four unrelated questions. The runs are those questions.
 */
export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  { value: 'profile', label: 'Profile', icon: User, landing: true },
  { value: 'ambassador', label: 'Ambassador', icon: BadgeCheck },
  { value: 'schedule', label: 'Schedule', icon: CalendarCheck },
  { value: 'reviews', label: 'Reviews', icon: Star },

  { value: 'subscription', label: 'Subscription', icon: CreditCard, group: 'account' },
  { value: 'credits', label: 'Credits', icon: Coins, group: 'account' },
  { value: 'billing', label: 'Billing', icon: FileText, group: 'account' },
  { value: 'documents', label: 'My Account', icon: ReceiptText, group: 'account' },

  { value: 'social-accounts', label: 'Social Accounts', icon: Share2, group: 'connections' },
  { value: 'websites', label: 'Websites', icon: Globe, group: 'connections' },
  { value: 'keys', label: 'Keys', icon: KeyRound, group: 'connections' },
  { value: 'webhooks', label: 'Webhooks', icon: Webhook, group: 'connections' },

  { value: 'team', label: 'Team', icon: Users, group: 'workspace', gate: 'team' },
  { value: 'modules', label: 'Modules', icon: LayoutGrid, group: 'workspace', gate: 'modules' },
  { value: 'supplier-portal', label: 'Supplier Portal', icon: Truck, group: 'workspace', gate: 'supplierPortal' },
];

export const DEFAULT_PROFILE_TAB: ProfileTabId = 'profile';
export const PROFILE_TAB_IDS: readonly ProfileTabId[] = PROFILE_SECTIONS.map((s) => s.value);

export type ProfileRailRow =
  | { kind: 'heading'; label: string }
  | { kind: 'section'; section: ProfileSection };

export type ProfileGates = Record<ProfileGateId, boolean>;

/**
 * The rail as rendered, with a heading before the first VISIBLE row of each group. Separated from
 * the JSX because the interleave is the part with a case worth pinning: a heading must follow what
 * survives the gates, or it ends up standing over the run above it.
 */
export function profileRailRows(gates: ProfileGates): ProfileRailRow[] {
  const rows: ProfileRailRow[] = [];
  let openGroup: ProfileSection['group'];
  for (const section of PROFILE_SECTIONS) {
    if (section.gate && !gates[section.gate]) continue;
    if (section.group && section.group !== openGroup) {
      rows.push({ kind: 'heading', label: PROFILE_SECTION_GROUPS[section.group] });
    }
    openGroup = section.group;
    rows.push({ kind: 'section', section });
  }
  return rows;
}
