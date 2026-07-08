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
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap shrink-0 text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-200"
        >
          <LayoutGrid className="w-4 h-4 flex-shrink-0" />
          <span className="font-light hidden sm:inline">Apps</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[22rem] p-0 rounded-2xl shadow-xl border-border/60"
      >
        {/* Radix caret pointing at the trigger — must sit outside the clipped wrapper below. */}
        <PopoverPrimitive.Arrow className="fill-popover" width={16} height={8} />

        <div className="rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="min-w-0">
            <div className="font-display font-semibold text-base leading-tight">Apps</div>
            <div className="text-xs text-muted-foreground">Tools active in this workspace</div>
          </div>
          <button
            onClick={() => go('/apps')}
            className="shrink-0 inline-flex items-center gap-1 text-sm text-primary hover:opacity-80 transition-opacity"
          >
            manage <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <>
              {active.map((app) => (
                <button
                  key={app.id}
                  onClick={() => go(app.path)}
                  className="group w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                    <app.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{app.label}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    </span>
                    {app.description && (
                      <span className="block text-xs text-muted-foreground truncate">{app.description}</span>
                    )}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}

              {available.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Available to add
                  </div>
                  {available.map((app) => (
                    <div key={app.id} className="w-full flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
                        <app.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium truncate block">
                          {app.label}
                          {app.priceLabel && <span className="ml-1 font-normal text-xs text-muted-foreground">· {app.priceLabel}</span>}
                        </span>
                        {app.description && (
                          <span className="block text-xs text-muted-foreground truncate">{app.description}</span>
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-7 px-2.5"
                        disabled={enabling === app.moduleSlug}
                        onClick={(e) => onEnable(e, app)}
                      >
                        {enabling === app.moduleSlug
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : (<><Plus className="h-3.5 w-3.5 mr-1" />{canManage ? 'Enable' : 'Request'}</>)}
                      </Button>
                    </div>
                  ))}
                </>
              )}

              {active.length === 0 && available.length === 0 && (
                <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                  No apps available yet.
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
