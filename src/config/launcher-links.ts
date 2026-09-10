/**
 * The inner links of a launcher app — its sections, its create actions, and (when it has neither)
 * its agent quick-starts — plus the per-hub "Jump to" shortcuts. ONE derivation, read by the desktop
 * Apps popover and the mobile Apps panel through `useLauncherLinks`.
 */
import {
  LAUNCHER_SECTIONS, LAUNCHER_ACTIONS, LAUNCHER_HUB_SHORTCUTS, LAUNCHER_SHORTCUTS,
  type LauncherSection,
} from '@/config/launcher-sections';
import type { HubId } from '@/config/nav-items';
import type { Capability } from '@/auth/capabilities';
import { getCapability } from '@/config/capabilities';
import { TOOLKITS } from '@/components/features/ai/agentToolsCatalog';
import type { LauncherApp } from '@/hooks/useLauncherApps';

export interface LinkGate {
  isModuleAvailable: (slug: string) => boolean;
  can: (c: Capability) => boolean;
  isWorkspaceManager: boolean;
  /**
   * The invited external accountant. A workspace ROLE, not a capability and not a purchase, which
   * is why it needs its own field: Finance's page drops its operational rows for that role, so a
   * chip without the same gate opens a tab that renders nothing.
   */
  isAccountant: boolean;
}

/** A run of consecutive sections sharing a heading. `label` is undefined for the ungrouped run. */
export interface LauncherSectionGroup {
  label?: string;
  items: LauncherSection[];
}

/**
 * Segment a gated section list into its headed runs, so the desktop popover and the mobile panel
 * present Finance's 24 chips the way its own rail does — Documents, then Tools — instead of as one
 * undifferentiated wall. Order is preserved, and a list with no `group` anywhere comes back as a
 * single unlabelled run, which is exactly what every other app gets today.
 */
export function groupSections(sections: readonly LauncherSection[]): LauncherSectionGroup[] {
  const out: LauncherSectionGroup[] = [];
  for (const s of sections) {
    const last = out[out.length - 1];
    if (last && last.label === s.group) last.items.push(s);
    else out.push({ label: s.group, items: [s] });
  }
  return out;
}

/** An agent quick-start, already resolved to the URL that opens the studio primed on it. */
export interface LauncherQuickStart {
  label: string;
  description?: string;
  to: string;
}

export interface AppLinkSet {
  /** Page sections / capability deep-links, gated. */
  sections: LauncherSection[];
  /** Quick-create triggers — only for an ACTIVE app; an upsell card creates nothing. */
  actions: LauncherSection[];
  /** Fallback when an active app has no sections and no actions: its toolkit's quick-starts. */
  quickStarts: LauncherQuickStart[];
  /** Whether the app has anything to expand at all. False for every inactive app. */
  hasLinks: boolean;
}

export function gateLinks(list: readonly LauncherSection[], gate: LinkGate): LauncherSection[] {
  return list.filter((s) =>
    (!s.moduleSlug || gate.isModuleAvailable(s.moduleSlug))
    && (!s.requireAnyCapability || s.requireAnyCapability.some(gate.can))
    && (!s.requireWorkspaceAdmin || gate.isWorkspaceManager)
    && !(s.hideForAccountant && gate.isAccountant));
}

/**
 * An agent app carries `?capability=<id>`; the capability names a toolkit; the toolkit declares
 * quick-starts. `?quickstart=<toolkit>:<label>` is honoured by pages/AgentHub.tsx independently of
 * `?capability=`, and the label MUST be the toolkit's own, verbatim.
 */
function capabilityQuickStarts(app: Pick<LauncherApp, 'path'>): LauncherQuickStart[] {
  const capId = new URLSearchParams(app.path.split('?')[1] || '').get('capability');
  const cap = capId ? getCapability(capId) : undefined;
  const tk = cap?.toolkitId ? TOOLKITS.find((t) => t.id === cap.toolkitId) : undefined;
  if (!capId || !tk) return [];
  return (tk.quick_starts ?? []).map((qs) => ({
    label: qs.label,
    description: qs.description,
    to: `/agent-hub?capability=${capId}&quickstart=${tk.id}:${encodeURIComponent(qs.label)}`,
  }));
}

export function appLinkSet(app: LauncherApp, gate: LinkGate): AppLinkSet {
  const sections = gateLinks(LAUNCHER_SECTIONS[app.id] ?? [], gate);
  const actions = app.active ? (LAUNCHER_ACTIONS[app.id] ?? []) : [];
  const quickStarts = app.active && sections.length === 0 && actions.length === 0
    ? capabilityQuickStarts(app)
    : [];
  return {
    sections,
    actions,
    quickStarts,
    hasLinks: app.active && sections.length + actions.length + quickStarts.length > 0,
  };
}

/**
 * The hub's cross-cutting shortcuts. The catch-all "More" group (key `'more'`, or null) has no hub
 * of its own and falls back to the global trio.
 */
export function hubShortcutSet(hubKey: string | null, gate: LinkGate): LauncherSection[] {
  const set = (hubKey && LAUNCHER_HUB_SHORTCUTS[hubKey as HubId]) || LAUNCHER_SHORTCUTS;
  return gateLinks(set, gate);
}
