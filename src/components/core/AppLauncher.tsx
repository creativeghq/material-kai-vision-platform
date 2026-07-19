// #251 — top-bar App Launcher. Hub-first DRILL-DOWN (2026-07-19): instead of every hub expanded
// at once (which made the menu enormous), the launcher shows the 6 Hub tiles first; click a hub to
// see its apps as a compact icon grid (each with its section sub-icons); click an app for its detail
// (inner links / quick-create / add-on upsell). Simpler + more accessible. Data comes from
// useLauncherApps (active/available + entitlement-aware enable/request) and the verified
// LAUNCHER_SECTIONS/LAUNCHER_ACTIONS/LAUNCHER_SHORTCUTS deep-links. Nothing here is account/logout.
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, ArrowRight, Loader2, Plus, Lock, LifeBuoy, Settings, Check, ChevronRight, ChevronLeft, Sparkles, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/core/ui/popover';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLauncherApps, groupAppsByHub, type LauncherApp } from '@/hooks/useLauncherApps';
import { LAUNCHER_SECTIONS, LAUNCHER_SHORTCUTS, LAUNCHER_ACTIONS, type LauncherSection } from '@/config/launcher-sections';
import { getCapability } from '@/config/capabilities';
import { TOOLKITS } from '@/components/features/ai/agentToolsCatalog';

const RECENT_KEY = 'launcher.recent.v1';

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 4);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

type View = 'hubs' | 'apps' | 'app';

export const AppLauncher: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('hubs');
  const [activeHubKey, setActiveHubKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const { active, available, canManage, enabling, enable, loading } = useLauncherApps();

  // Reset to the top of the drill-down each time the flyout opens.
  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setView('hubs');
      setActiveHubKey(null);
      setSelectedId(null);
    }
  }, [open]);

  // All apps (active + available-to-add) grouped into Hubs. Inactive apps stay visible in their Hub
  // with a lock → the app detail offers Enable/Request (upsell → revenue).
  const allApps = useMemo(() => [...active, ...available], [active, available]);
  const hubGroups = useMemo(() => groupAppsByHub(allApps), [allApps]);

  const byId = useMemo(() => {
    const m = new Map<string, LauncherApp>();
    allApps.forEach((a) => m.set(a.id, a));
    return m;
  }, [allApps]);

  const activeHubGroup = activeHubKey
    ? hubGroups.find((g) => (g.hub?.id ?? 'more') === activeHubKey) ?? null
    : null;
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const go = (path: string, moduleId?: string) => {
    setOpen(false);
    if (moduleId) setRecent(pushRecent(moduleId));
    navigate(path);
  };

  const openHub = (key: string) => { setActiveHubKey(key); setView('apps'); };
  const openApp = (id: string) => { setSelectedId(id); setView('app'); };
  const back = () => { if (view === 'app') setView('apps'); else setView('hubs'); };

  const onEnable = async (e: React.MouseEvent, app: LauncherApp) => {
    e.stopPropagation();
    const res = await enable(app);
    toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
  };

  const shortcutRow = (s: LauncherSection) => (
    <button
      key={s.to}
      type="button"
      onClick={() => go(s.to)}
      className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-left hover:border-primary/50 hover:bg-accent/40 transition-colors"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/60 text-primary shrink-0"><s.icon className="h-4 w-4" /></span>
      <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{s.label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
    </button>
  );

  const sections = selected ? (LAUNCHER_SECTIONS[selected.id] ?? []) : [];
  // Context-aware quick-create triggers for the selected active module (empty for add-ons).
  const actions = selected && selected.active ? (LAUNCHER_ACTIONS[selected.id] ?? []) : [];

  // Agent-driven apps (Interior / Social / SEO) carry `?capability=<id>` in their path. Surface
  // that capability's toolkit quick-starts as FAST actions right in the launcher — one click runs
  // the action (agent + toolkit primed) instead of dumping the user in a blank chat (#275 UX).
  const selectedCapabilityId = selected
    ? new URLSearchParams(selected.path.split('?')[1] || '').get('capability')
    : null;
  const selectedCapability = selectedCapabilityId ? getCapability(selectedCapabilityId) : undefined;
  const capabilityToolkitId = selectedCapability?.toolkitId;
  const capabilityQuickStarts = capabilityToolkitId
    ? (TOOLKITS.find((t) => t.id === capabilityToolkitId)?.quick_starts ?? [])
    : [];

  const recentApps = recent.filter((id) => byId.has(id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Apps"
          title="Apps"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap shrink-0 text-muted-foreground hover:bg-primary hover:text-primary-foreground data-[state=open]:bg-primary data-[state=open]:text-primary-foreground transition-all duration-200 cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4 flex-shrink-0" />
          <span className="font-light hidden sm:inline">Apps</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(46rem,calc(100vw-1.5rem))] p-0 rounded-2xl shadow-xl border-border/60 overflow-hidden"
      >
        <PopoverPrimitive.Arrow className="fill-popover" width={16} height={8} />

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Header / breadcrumb ── */}
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
              {view !== 'hubs' ? (
                <button
                  type="button"
                  onClick={back}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0"
                  aria-label="Back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <LayoutGrid className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex items-center gap-1.5 text-sm">
                <span className={view === 'hubs' ? 'font-semibold' : 'text-muted-foreground'}>Apps</span>
                {view !== 'hubs' && activeHubGroup && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    <span className={view === 'apps' ? 'font-semibold truncate' : 'text-muted-foreground truncate'}>
                      {activeHubGroup.hub?.label ?? 'More'}
                    </span>
                  </>
                )}
                {view === 'app' && selected && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    <span className="font-semibold truncate">{selected.label}</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-3 md:p-4 md:min-h-[360px] md:max-h-[72vh] overflow-y-auto custom-scrollbar">
              {/* ══ LEVEL 0 — Hubs ══ */}
              {view === 'hubs' && (
                <>
                  {hubGroups.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {hubGroups.map(({ hub, apps }) => {
                        const key = hub?.id ?? 'more';
                        const HubIcon = hub?.icon ?? LayoutGrid;
                        const activeCount = apps.filter((a) => a.active).length;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => openHub(key)}
                            className="group text-left rounded-2xl border border-border bg-card p-3.5 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/30 transition-all"
                          >
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              <HubIcon className="h-5 w-5" />
                            </span>
                            <div className="text-sm font-semibold leading-tight">{hub?.label ?? 'More'}</div>
                            {hub?.description && (
                              <div className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">{hub.description}</div>
                            )}
                            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                              {apps.length} app{apps.length === 1 ? '' : 's'}
                              {activeCount < apps.length && <span className="text-muted-foreground/70">· {activeCount} on</span>}
                              <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">No apps yet.</p>
                  )}

                  {recentApps.length > 0 && (
                    <>
                      <div className="mt-4 mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentApps.map((id) => {
                          const app = byId.get(id)!;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => go(app.path, app.id)}
                              className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/40 transition-colors"
                            >
                              <app.icon className="h-3.5 w-3.5" /> {app.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ══ LEVEL 1 — Apps in the chosen Hub ══ */}
              {view === 'apps' && activeHubGroup && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {activeHubGroup.apps.map((app) => {
                    const subs = LAUNCHER_SECTIONS[app.id] ?? [];
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => openApp(app.id)}
                        className="group relative text-left rounded-xl border border-border bg-card p-3 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/30 transition-all"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors mb-2">
                          <app.icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="text-[13px] font-medium truncate">{app.label}</div>
                        {subs.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-muted-foreground/70">
                            {subs.slice(0, 4).map((s, i) => <s.icon key={i} className="h-3 w-3" />)}
                            {subs.length > 4 && <span className="text-[10px]">+{subs.length - 4}</span>}
                          </div>
                        )}
                        {app.active
                          ? <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" title="Active" />
                          : <Lock className="absolute top-2 right-2 h-3.5 w-3.5 text-muted-foreground/60" />}
                        {!app.active && app.priceLabel && (
                          <div className="mt-1 text-[10px] font-medium text-primary">{app.priceLabel}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ══ LEVEL 2 — App detail ══ */}
              {view === 'app' && selected && (
                selected.active ? (
                  <>
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0 shadow-sm">
                        <selected.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-lg font-semibold leading-tight tracking-tight">{selected.label}</h3>
                        {selected.description && <p className="mt-1 text-xs text-muted-foreground leading-snug max-w-[46ch]">{selected.description}</p>}
                      </div>
                      <Button size="sm" className="ml-auto shrink-0 gap-1.5" onClick={() => go(selected.path, selected.id)}>
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {sections.length > 0 ? (
                      <>
                        <div className="mt-4 mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {sections.length} {sections.length === 1 ? 'section' : 'sections'}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {sections.map((s) => (
                            <button
                              key={s.to}
                              type="button"
                              onClick={() => go(s.to, selected.id)}
                              className="group text-left rounded-xl border border-border bg-card p-3 hover:-translate-y-0.5 hover:border-border hover:bg-accent/40 transition-all"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/60 text-primary mb-2.5">
                                <s.icon className="h-4 w-4" />
                              </span>
                              <div className="text-[13px] font-medium truncate">{s.label}</div>
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <ArrowRight className="h-3 w-3" /> Open
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : capabilityQuickStarts.length > 0 ? (
                      <>
                        <div className="mt-4 mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Quick actions
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {capabilityQuickStarts.map((qs) => (
                            <button
                              key={qs.label}
                              type="button"
                              onClick={() => go(
                                `/agent-hub?capability=${selectedCapabilityId}&quickstart=${capabilityToolkitId}:${encodeURIComponent(qs.label)}`,
                                selected.id,
                              )}
                              className="group text-left rounded-xl border border-border bg-card p-3 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 transition-all"
                              title={qs.description}
                            >
                              <div className="text-[13px] font-medium truncate">{qs.label}</div>
                              {qs.description && <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{qs.description}</div>}
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-primary">
                                <ArrowRight className="h-3 w-3" /> Run in agent
                              </div>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => go(selected.path, selected.id)}
                          className="mt-2.5 w-full text-center rounded-xl border border-dashed border-border bg-card/60 px-4 py-2.5 text-xs text-muted-foreground hover:bg-accent/40 transition-colors"
                        >
                          Or open {selected.label} in the agent canvas →
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => go(selected.path, selected.id)}
                        className="mt-4 w-full text-left rounded-xl border border-dashed border-border bg-card/60 px-4 py-5 hover:bg-accent/40 transition-colors"
                      >
                        <div className="text-sm font-medium">Open the {selected.label} workspace</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">Everything for {selected.label} lives on its main page.</div>
                      </button>
                    )}

                    {/* Create-in + jump-to */}
                    {actions.length > 0 && (
                      <>
                        <div className="mt-5 mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Create in {selected.label}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {actions.map((a) => (
                            <button
                              key={a.to}
                              type="button"
                              onClick={() => go(a.to, selected.id)}
                              className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-left hover:border-primary/50 hover:bg-accent/40 transition-colors"
                            >
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/60 text-primary shrink-0"><a.icon className="h-4 w-4" /></span>
                              <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{a.label}</span>
                              <Plus className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="mt-5 mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Across your apps</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">{LAUNCHER_SHORTCUTS.map(shortcutRow)}</div>
                  </>
                ) : (
                  // Add-on / coming-soon upsell
                  <div className="rounded-2xl border border-border bg-card p-6 text-center">
                    <span className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/60 text-primary">
                      <selected.icon className="h-7 w-7" />
                    </span>
                    <div className="mb-2 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary">
                        <Sparkles className="h-3 w-3" /> {selected.priceLabel ? `Add-on · ${selected.priceLabel}` : 'Paid add-on'}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-semibold">{selected.label}</h3>
                    {selected.description && <p className="mx-auto mt-1.5 max-w-[42ch] text-xs text-muted-foreground leading-relaxed">{selected.description}</p>}
                    <div className="mt-5 flex items-center justify-center gap-2.5">
                      <Button size="sm" className="gap-1.5" disabled={enabling === selected.moduleSlug} onClick={(e) => onEnable(e, selected)}>
                        {enabling === selected.moduleSlug
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : (<><Plus className="h-4 w-4" /> {canManage ? 'Enable add-on' : 'Request access'}</>)}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => go('/apps')}>Learn more</Button>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* ── Support strip ── (Tools first, before Help & Support) */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-t border-border/60 bg-muted/30">
              <button type="button" onClick={() => go('/tools')} className="flex items-center gap-3 border-r border-border/60 px-4 py-3.5 text-left hover:bg-accent/40 transition-colors">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/60 text-primary shrink-0"><Wrench className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-medium truncate">Tools</span><span className="block text-[11px] text-muted-foreground truncate">Scanners, calculators &amp; agent tools</span></span>
              </button>
              <button type="button" onClick={() => go('/knowledge-base')} className="flex items-center gap-3 border-r border-border/60 px-4 py-3.5 text-left hover:bg-accent/40 transition-colors">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/60 text-primary shrink-0"><LifeBuoy className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-medium truncate">Help &amp; Support</span><span className="block text-[11px] text-muted-foreground truncate">Guides &amp; answers</span></span>
              </button>
              <button type="button" onClick={() => go('/profile')} className="flex items-center gap-3 border-r border-border/60 px-4 py-3.5 text-left hover:bg-accent/40 transition-colors">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/60 text-primary shrink-0"><Settings className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-medium truncate">Preferences</span><span className="block text-[11px] text-muted-foreground truncate">Your account &amp; workspace</span></span>
              </button>
              <button type="button" onClick={() => go('/apps')} className="flex items-center gap-3 px-4 py-3.5 text-left hover:bg-accent/40 transition-colors">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/60 text-primary shrink-0"><Check className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-medium truncate">Manage apps</span><span className="block text-[11px] text-muted-foreground truncate">Enable &amp; configure</span></span>
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
