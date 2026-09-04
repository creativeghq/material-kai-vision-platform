/**
 * The inner links of a launcher app — its sections, its create actions, and (when it has neither)
 * its agent quick-starts — plus the per-hub "Jump to" shortcuts. ONE derivation, read by the desktop
 * Apps popover and the mobile Apps panel through `useLauncherLinks`.
 *
 * This used to be a closure inside AppLauncher.tsx. The mobile menu needed the same answer, and a
 * second copy is how the two surfaces start disagreeing: the desktop applied three gates to a
 * section (module, capability, workspace-admin) and only two to a shortcut, and a phone port
 * written from memory would have picked one of those and been silently wrong on the other. So the
 * gate lives here, and tests/unit/launcherLinksSingleSource.test.ts fails the build if any file
 * under src/ indexes LAUNCHER_SECTIONS / LAUNCHER_ACTIONS / LAUNCHER_HUB_SHORTCUTS except this one.
 *
 * The gate answers three different questions, and every link gets all three:
 *   • `moduleSlug`            — has this WORKSPACE bought the add-on the link lands on?
 *   • `requireAnyCapability`  — may this PERSON open the route (a CapabilityGuard on it)?
 *   • `requireWorkspaceAdmin` — may this person REWIRE it (a WorkspaceAdminGuard on it)?
 * A link that passes two of the three resolves perfectly and lands on a wall, which is the failure
 * every comment in launcher-sections.ts is about.
 *
 * Pure functions, no React: the guard test calls them directly against the real tables.
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
    && (!s.requireWorkspaceAdmin || gate.isWorkspaceManager));
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
