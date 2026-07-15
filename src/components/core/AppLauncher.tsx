// #251 — top-bar App Launcher. Opens a card of the active workspace's apps: the ones already
// active (click to open) plus any the persona can add (click to enable / request). Rich rows with
// an icon, title, and subheading — see useLauncherApps for the data model.
import React, { useState } from 'react';
import { LayoutGrid, ArrowRight, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/core/ui/popover';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLauncherApps, type LauncherApp } from '@/hooks/useLauncherApps';

export const AppLauncher: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { active, available, canManage, enabling, enable, loading } = useLauncherApps();

  const go = (path: string) => { setOpen(false); navigate(path); };

  const onEnable = async (e: React.MouseEvent, app: LauncherApp) => {
    e.stopPropagation();
    const res = await enable(app);
    toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Apps"
          title="Apps"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap shrink-0 text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-200 cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4 flex-shrink-0" />
          <span className="font-light hidden sm:inline">Apps</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(44rem,calc(100vw-1.5rem))] p-0 rounded-2xl shadow-xl border-border/60"
      >
        {/* Radix caret pointing at the trigger — must sit outside the clipped wrapper below. */}
        <PopoverPrimitive.Arrow className="fill-popover" width={16} height={8} />

        <div className="rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border/60">
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold leading-tight tracking-tight">Apps</div>
            <div className="text-xs text-muted-foreground mt-0.5">Everything active in this workspace</div>
          </div>
          <button
            onClick={() => go('/apps')}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            Manage <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[62vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <div className="grid grid-cols-3 gap-1 p-3">
                  {active.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => go(app.path)}
                      title={app.description || app.label}
                      className="group flex flex-col gap-2.5 rounded-xl p-3 text-left transition-colors duration-200 hover:bg-accent/50 cursor-pointer"
                    >
                      <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground/60 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <app.icon className="h-5 w-5" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[hsl(var(--success))] ring-2 ring-popover" title="Active" />
                      </span>
                      <span className="space-y-0.5">
                        <span className="block text-sm font-semibold leading-tight truncate">{app.label}</span>
                        <span className="block text-[11.5px] text-muted-foreground leading-snug line-clamp-2 min-h-[2rem]">
                          {app.description || 'Open'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {available.length > 0 && (
                <div className="border-t border-border/60 bg-muted/30 px-3 pb-4 pt-3">
                  <div className="flex items-center gap-2 px-1 pb-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Available to add</span>
                    <span className="h-px flex-1 bg-border/60" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{available.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {available.map((app) => (
                      <div key={app.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent/30 transition-colors">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border/50 shrink-0">
                          <app.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{app.label}</span>
                            {app.priceLabel && (
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{app.priceLabel}</span>
                            )}
                          </span>
                          {app.description && (
                            <span className="block text-xs text-muted-foreground truncate">{app.description}</span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-7 px-2.5 cursor-pointer"
                          disabled={enabling === app.moduleSlug}
                          onClick={(e) => onEnable(e, app)}
                        >
                          {enabling === app.moduleSlug
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : (<><Plus className="h-3.5 w-3.5 mr-1" />{canManage ? 'Enable' : 'Request'}</>)}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {active.length === 0 && available.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <LayoutGrid className="h-6 w-6" />
                  </span>
                  <p className="text-sm text-muted-foreground">No apps here yet.</p>
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
