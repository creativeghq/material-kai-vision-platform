// #251 — top-bar App Launcher, three-pane layout (2026-07-18).
// A full-width flyout: module rail (left) · the selected module's inner links, or an add-on upsell
// (center) · jump-to shortcuts + recent (right) · a support strip footer. Data comes from
// useLauncherApps (active/available + entitlement-aware enable/request) and the verified
// LAUNCHER_SECTIONS/LAUNCHER_SHORTCUTS deep-links. Nothing here is account/logout — that stays in
// the avatar menu.
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, ArrowRight, Loader2, Plus, Lock, LifeBuoy, Settings, Check, ChevronRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/core/ui/popover';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLauncherApps, type LauncherApp } from '@/hooks/useLauncherApps';
import { LAUNCHER_SECTIONS, LAUNCHER_SHORTCUTS, LAUNCHER_ACTIONS, type LauncherSection } from '@/config/launcher-sections';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const { active, available, canManage, enabling, enable, loading } = useLauncherApps();

  useEffect(() => { if (open) setRecent(readRecent()); }, [open]);

  // Default the rail selection to the first active app (alphabetical from the hook) once loaded.
  useEffect(() => {
    if (selectedId) return;
    if (active.length) setSelectedId(active[0].id);
    else if (available.length) setSelectedId(available[0].id);
  }, [active, available, selectedId]);

  const byId = useMemo(() => {
    const m = new Map<string, LauncherApp>();
    [...active, ...available].forEach((a) => m.set(a.id, a));
    return m;
  }, [active, available]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

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

  const railItem = (app: LauncherApp) => {
    const sel = app.id === selectedId;
    return (
      <button
        key={app.id}
        type="button"
        onClick={() => setSelectedId(app.id)}
        className={[
          'w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors border',
          sel ? 'bg-card border-border text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50',
        ].join(' ')}
      >
        <span className={[
          'flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-colors',
          sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        ].join(' ')}>
          <app.icon className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0 truncate">{app.label}</span>
        {app.active
          ? <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] shrink-0" title="Active" />
          : <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
      </button>
    );
  };

  const sections = selected ? (LAUNCHER_SECTIONS[selected.id] ?? []) : [];
  // Context-aware quick-create triggers for the selected active module (empty for add-ons).
  const actions = selected && selected.active ? (LAUNCHER_ACTIONS[selected.id] ?? []) : [];

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
              {/* ── Left rail ── */}
              <aside className="border-b md:border-b-0 md:border-r border-border/60 bg-muted/20 p-2.5 md:min-h-[460px]">
                <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Your apps</div>
                <div className="space-y-0.5">
                  {active.length ? active.map(railItem) : <p className="px-2 py-2 text-xs text-muted-foreground">No apps yet.</p>}
                </div>

                {available.length > 0 && (
                  <>
                    <div className="my-2.5 h-px bg-border/60" />
                    <div className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Available to add</div>
                    <div className="space-y-0.5">{available.map(railItem)}</div>
                  </>
                )}

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

              {/* ── Center ── */}
              <section className="p-4 md:p-5 min-w-0">
                {!selected ? (
                  <div className="flex h-full items-center justify-center py-12 text-sm text-muted-foreground">Pick an app on the left.</div>
                ) : selected.active ? (
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
                )}
              </section>

              {/* ── Right rail: context-aware quick-create + jump-to ── */}
              <aside className="border-t md:border-t-0 md:border-l border-border/60 bg-muted/20 p-4">
                {actions.length > 0 ? (
                  <>
                    <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Create in {selected!.label}</div>
                    <div className="space-y-1.5">
                      {actions.map((a) => (
                        <button
                          key={a.to}
                          type="button"
                          onClick={() => go(a.to, selected!.id)}
                          className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-left hover:border-primary/50 hover:bg-accent/40 transition-colors"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/60 text-primary shrink-0"><a.icon className="h-4 w-4" /></span>
                          <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{a.label}</span>
                          <Plus className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        </button>
                      ))}
                    </div>
                    <div className="mt-5 mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Across your apps</div>
                    <div className="space-y-1.5">{LAUNCHER_SHORTCUTS.map(shortcutRow)}</div>
                  </>
                ) : (
                  <>
                    <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Jump to</div>
                    <div className="space-y-1.5">{LAUNCHER_SHORTCUTS.map(shortcutRow)}</div>
                  </>
                )}

                {recent.filter((id) => byId.has(id)).length > 0 && (
                  <>
                    <div className="mt-5 mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</div>
                    <div className="space-y-0.5">
                      {recent.filter((id) => byId.has(id)).map((id) => {
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

            {/* ── Support strip ── */}
            <div className="grid grid-cols-3 border-t border-border/60 bg-muted/30">
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
