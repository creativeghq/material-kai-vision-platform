// #251 — top-bar App Launcher, three-pane layout. Hubs-first (2026-07-19): the LEFT rail lists the
// Hubs; clicking a Hub fills the MIDDLE with every app in that hub AND each app's inner links
// (sections + create actions), so e.g. Sales → Quotes (New Quote · Open), CRM (Users · Contacts …).
// The RIGHT rail keeps cross-app shortcuts + recent. Data comes from useLauncherApps
// (active/available + entitlement-aware enable/request) and the verified LAUNCHER_* deep-links.
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, ArrowUpRight, Loader2, Plus, Lock, LifeBuoy, Settings, Check, ChevronRight, Sparkles, Wrench } from 'lucide-react';
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

export const AppLauncher: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  // Which Hub's apps fill the middle. Defaults to the first hub on open.
  const [activeHubKey, setActiveHubKey] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const { active, available, canManage, enabling, enable, loading } = useLauncherApps();

  useEffect(() => { if (open) setRecent(readRecent()); }, [open]);

  // All apps (active + available-to-add) grouped into Hubs. Inactive apps stay visible in their Hub
  // with a lock → Enable/Request inline (upsell → revenue).
  const allApps = useMemo(() => [...active, ...available], [active, available]);
  const hubGroups = useMemo(() => groupAppsByHub(allApps), [allApps]);

  // Default the middle to the first non-empty Hub once loaded.
  useEffect(() => {
    if (activeHubKey) return;
    const first = hubGroups[0];
    if (first) setActiveHubKey(first.hub?.id ?? 'more');
  }, [hubGroups, activeHubKey]);

  const byId = useMemo(() => {
    const m = new Map<string, LauncherApp>();
    allApps.forEach((a) => m.set(a.id, a));
    return m;
  }, [allApps]);

  const activeHubGroup = activeHubKey
    ? hubGroups.find((g) => (g.hub?.id ?? 'more') === activeHubKey) ?? null
    : null;

  const go = (path: string, moduleId?: string) => {
    setOpen(false);
    if (moduleId) setRecent(pushRecent(moduleId));
    navigate(path);
  };

  const onEnable = async (e: React.MouseEvent, app: LauncherApp) => {
    e.stopPropagation();
    const res = await enable(app);
    toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
  };

  // An app's agent-capability quick-starts (Interior / Social / SEO carry ?capability=<id>), used as
  // a fallback set of inner links when the app has no page sections/create-actions.
  const capabilityQuickStarts = (app: LauncherApp) => {
    const capId = new URLSearchParams(app.path.split('?')[1] || '').get('capability');
    const cap = capId ? getCapability(capId) : undefined;
    const tk = cap?.toolkitId ? TOOLKITS.find((t) => t.id === cap.toolkitId) : undefined;
    return { capId, toolkitId: cap?.toolkitId, quickStarts: tk?.quick_starts ?? [] };
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

  const recentApps = recent.filter((id) => byId.has(id));

  // One app "card" in the middle: header (icon · name · Open/Enable) + its inner links (sections +
  // create actions, else agent quick-starts).
  const renderAppCard = (app: LauncherApp) => {
    const sections = LAUNCHER_SECTIONS[app.id] ?? [];
    const actions = app.active ? (LAUNCHER_ACTIONS[app.id] ?? []) : [];
    const cap = (sections.length === 0 && actions.length === 0 && app.active) ? capabilityQuickStarts(app) : null;
    const quickStarts = cap?.quickStarts ?? [];

    return (
      <div key={app.id} className="rounded-xl bg-muted/40 p-3">
        <div className="flex items-center gap-2.5">
          <span className={[
            'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
            app.active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          ].join(' ')}>
            <app.icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">
              {app.label}
              {!app.active && <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
            </div>
            {app.description && <div className="text-[11px] text-muted-foreground truncate">{app.description}</div>}
          </div>
          {app.active ? (
            <button
              type="button"
              title={`Open ${app.label}`}
              aria-label={`Open ${app.label}`}
              onClick={() => go(app.path, app.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          ) : (
            <Button size="sm" className="shrink-0 gap-1.5" disabled={enabling === app.moduleSlug} onClick={(e) => onEnable(e, app)}>
              {enabling === app.moduleSlug
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : (<><Plus className="h-4 w-4" /> {app.priceLabel ? app.priceLabel : (canManage ? 'Enable' : 'Request')}</>)}
            </Button>
          )}
        </div>

        {app.active && (sections.length > 0 || actions.length > 0 || quickStarts.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {sections.map((s) => (
              <button
                key={s.to}
                type="button"
                onClick={() => go(s.to, app.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-background px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <s.icon className="h-3.5 w-3.5 text-primary/80" /> {s.label}
              </button>
            ))}
            {actions.map((a) => (
              <button
                key={a.to}
                type="button"
                onClick={() => go(a.to, app.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-background px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-primary/80" /> {a.label}
              </button>
            ))}
            {cap && quickStarts.map((qs) => (
              <button
                key={qs.label}
                type="button"
                title={qs.description}
                onClick={() => go(`/agent-hub?capability=${cap.capId}&quickstart=${cap.toolkitId}:${encodeURIComponent(qs.label)}`, app.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-background px-2 py-1 text-[12px] text-primary hover:bg-accent/60 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" /> {qs.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

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
        className="w-[min(62rem,calc(100vw-1.5rem))] p-0 rounded-2xl shadow-xl border-border/60 overflow-hidden"
      >
        <PopoverPrimitive.Arrow className="fill-popover" width={16} height={8} />

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[224px_minmax(0,1fr)_244px]">
              {/* ── Left rail: the Hubs — click one to fill the middle ── */}
              <aside className="border-b md:border-b-0 md:border-r border-border/60 bg-muted/20 p-2.5 md:min-h-[460px] md:max-h-[70vh] md:overflow-y-auto">
                <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Hubs</div>
                {hubGroups.length ? (
                  <div className="space-y-0.5">
                    {hubGroups.map(({ hub, apps }) => {
                      const key = hub?.id ?? 'more';
                      const HubIcon = hub?.icon ?? LayoutGrid;
                      const sel = key === activeHubKey;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveHubKey(key)}
                          className={[
                            'w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors border',
                            sel ? 'bg-card border-border text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50',
                          ].join(' ')}
                        >
                          <span className={[
                            'flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-colors',
                            sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          ].join(' ')}>
                            <HubIcon className="h-4 w-4" />
                          </span>
                          <span className="flex-1 min-w-0 truncate font-medium">{hub?.label ?? 'More'}</span>
                          <span className="text-[11px] text-muted-foreground/70 shrink-0">{apps.length}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="px-2 py-2 text-xs text-muted-foreground">No apps yet.</p>}

                <div className="my-2.5 h-px bg-border/60" />
                <button type="button" onClick={() => go('/knowledge-base')} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0"><LifeBuoy className="h-4 w-4" /></span> Support
                </button>
                <button type="button" onClick={() => go('/profile')} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0"><Settings className="h-4 w-4" /></span> Settings
                </button>
                <button type="button" onClick={() => go('/apps')} className="mt-1.5 w-full flex items-center justify-center gap-2 rounded-xl bg-accent/60 px-3 py-2 text-sm font-medium text-primary hover:bg-accent transition-colors">
                  <LayoutGrid className="h-4 w-4" /> Browse all apps
                </button>
              </aside>

              {/* ── Center: the selected Hub's apps, each with its inner links ── */}
              <section className="p-4 md:p-5 min-w-0">
                {!activeHubGroup ? (
                  <div className="flex h-full items-center justify-center py-12 text-sm text-muted-foreground">Pick a hub on the left.</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                        {activeHubGroup.hub ? <activeHubGroup.hub.icon className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-lg font-semibold leading-tight tracking-tight">{activeHubGroup.hub?.label ?? 'More'}</h3>
                        {activeHubGroup.hub?.description && <p className="text-xs text-muted-foreground leading-snug">{activeHubGroup.hub.description}</p>}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {activeHubGroup.apps.map(renderAppCard)}
                    </div>
                  </>
                )}
              </section>

              {/* ── Right rail: cross-app shortcuts + recent ── */}
              <aside className="border-t md:border-t-0 md:border-l border-border/60 bg-muted/20 p-4">
                <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Jump to</div>
                <div className="space-y-1.5">{LAUNCHER_SHORTCUTS.map(shortcutRow)}</div>

                {recentApps.length > 0 && (
                  <>
                    <div className="mt-5 mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</div>
                    <div className="space-y-0.5">
                      {recentApps.map((id) => {
                        const app = byId.get(id)!;
                        return (
                          <button key={id} type="button" onClick={() => go(app.path, app.id)} className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0"><app.icon className="h-3.5 w-3.5" /></span>
                            {app.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </aside>
            </div>

            {/* ── Support strip ── (Tools sits first, before Help & Support) */}
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
