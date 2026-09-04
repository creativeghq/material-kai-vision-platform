// The mobile Apps panel — the phone's version of the desktop Apps launcher.
//
// A right-side drawer that walks the SAME tree the desktop popover lays out in three columns:
//
//   Apps (root)        →  Hub (e.g. Finance Hub)      →  App (e.g. Finance)
//   · Recent              · every app in the hub         · Open Finance
//   · Hubs (+ More)         (Open, or ▸ for sections)    · Create: New Invoice, New Order
//   · Tools / Help /      · Jump to: the hub's           · In Finance: Receivables, Payables, …
//     Preferences /         cross-cutting shortcuts      · (or the toolkit's quick-starts)
//     Manage modules
//   · Install app
//
// Each step is pushed on a stack and slides in from the right; Back pops. It replaced a bottom
// sheet holding a flat 3-column grid of every entitled app (30+ icons for an owner, no grouping, no
// sub-navigation), so reaching Finance → Bank feed meant finding one icon among thirty and then a
// tab in a ten-tab strip. Two things matter in the design:
//
//   • It is the SAME data. `useLauncherApps` (active + available-to-add, gated exactly like the
//     desktop) and `useLauncherLinks` (sections, create actions, quick-starts, hub shortcuts — the
//     one gate). What the phone offers is what the laptop offers; there is no second list to drift.
//   • It opens WHERE YOU ARE. Tap Apps while inside Finance and the panel opens on Finance's step
//     with Back leading up to the hub, so the menu doubles as the section switcher for the app you
//     are in. `matchAppForLocation` decides ownership by pathname AND the query parameters that are
//     part of an app's identity (`/crm?tab=pipeline` is Deals, `/crm` is CRM).
//
// A row that has sections is split: the body opens the app, the trailing ▸ pushes its step. Two
// targets on one row is deliberate — the commonest action from this menu is "open the app", and a
// detour through the section list on every open is a tax on exactly that.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUpRight, Check, ChevronLeft, ChevronRight, LayoutGrid, LifeBuoy, Loader2, Lock, Plus,
  Settings, Sparkles, Wrench, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/core/ui/sheet';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLauncherApps, groupAppsByHub, type LauncherApp, type HubGroup } from '@/hooks/useLauncherApps';
import { useLauncherLinks } from '@/hooks/useLauncherLinks';
import { matchAppForLocation } from '@/config/launcher-location';
import { readRecentApps, pushRecentApp } from '@/services/launcherRecent';
import { cn } from '@/lib/utils';
import { MobileInstallButton } from './MobileInstallButton';

type Step = { kind: 'root' } | { kind: 'hub'; key: string } | { kind: 'app'; id: string };
const ROOT: Step = { kind: 'root' };
const hubKeyOf = (g: HubGroup) => g.hub?.id ?? 'more';
const stepKey = (s: Step) => (s.kind === 'root' ? 'root' : `${s.kind}:${s.kind === 'hub' ? s.key : s.id}`);

/** The catch-all group has no Hub row of its own; give it the same two lines the real hubs get. */
const MORE_LABEL = 'More';
const MORE_DESCRIPTION = 'Templates, blueprints and tools shared by every hub.';

/**
 * Where the panel opens for the current URL: inside the app you are in (if it has sections), else
 * on its hub, else at the root. Only ACTIVE apps can own a URL — you cannot be inside an upsell.
 */
export function startStack(
  groups: readonly HubGroup[],
  pathname: string,
  search: string,
  hasLinks: (app: LauncherApp) => boolean,
): Step[] {
  const app = matchAppForLocation(groups.flatMap((g) => g.apps).filter((a) => a.active), pathname, search);
  if (!app) return [ROOT];
  const group = groups.find((g) => g.apps.some((a) => a.id === app.id));
  if (!group) return [ROOT];
  const hub: Step = { kind: 'hub', key: hubKeyOf(group) };
  return hasLinks(app) ? [ROOT, hub, { kind: 'app', id: app.id }] : [ROOT, hub];
}

// ───────────────────────────── rows ─────────────────────────────

const GroupLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('pb-1.5 pt-4 text-[11px] font-semibold text-muted-foreground', className)}>{children}</div>
);

interface MenuRowProps {
  icon: LucideIcon;
  label: string;
  hint?: string;
  /** Lines the hint may take. Hubs get two (their description is the reason to open them). */
  hintLines?: 1 | 2;
  /** Small trailing text, e.g. a count. */
  meta?: string;
  /** `chevron` pushes a step; `open` navigates. The glyph says which will happen before the tap. */
  trailing?: 'chevron' | 'open' | 'none';
  iconTone?: 'default' | 'primary';
  emphasis?: boolean;
  /** A real link when set (long-press, open in new tab); a button otherwise. */
  to?: string;
  onClick?: () => void;
  /** A second target at the row's trailing edge, separated by a hairline. */
  accessory?: React.ReactNode;
}

const MenuRow: React.FC<MenuRowProps> = ({
  icon: Icon, label, hint, hintLines = 1, meta, trailing = 'none', iconTone = 'default', emphasis, to, onClick, accessory,
}) => {
  const inner = (
    <>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          iconTone === 'primary' ? 'bg-primary/[0.12] text-primary' : 'bg-surface-sunken text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', emphasis ? 'font-semibold text-primary' : 'text-foreground')}>{label}</span>
        {hint && (
          <span className={cn('block text-xs leading-snug text-muted-foreground', hintLines === 2 ? 'line-clamp-2' : 'line-clamp-1')}>
            {hint}
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span>}
      {trailing === 'chevron' && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      {trailing === 'open' && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </>
  );
  const cls = 'flex min-h-12 w-full min-w-0 items-center gap-3 px-4 py-2 text-left transition-colors active:bg-surface-hover';
  const main = to ? (
    <Link to={to} onClick={onClick} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
  if (!accessory) return main;
  return (
    <div className="flex items-stretch">
      {main}
      <div className="flex shrink-0 items-stretch border-l border-hairline">{accessory}</div>
    </div>
  );
};

// ───────────────────────────── panel ─────────────────────────────

interface MobileAppsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MobileAppsMenu: React.FC<MobileAppsMenuProps> = ({ open, onOpenChange }) => {
  const location = useLocation();
  const { toast } = useToast();
  const { active, available, canManage, enabling, enable, loading } = useLauncherApps();
  const { appLinks, hubShortcuts } = useLauncherLinks();

  const allApps = useMemo(() => [...active, ...available], [active, available]);
  const groups = useMemo(() => groupAppsByHub(allApps), [allApps]);
  const byId = useMemo(() => new Map(allApps.map((a) => [a.id, a])), [allApps]);

  const [stack, setStack] = useState<Step[]>([ROOT]);
  const [dir, setDir] = useState<'push' | 'pop'>('push');
  const [recent, setRecent] = useState<string[]>([]);
  // Seed the stack ONCE per open, and only once the apps are known — seeding while `loading` would
  // find no owner for the URL and open at the root on every cold start.
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) { seeded.current = false; return; }
    if (loading || seeded.current) return;
    seeded.current = true;
    setDir('push');
    setStack(startStack(groups, location.pathname, location.search, (a) => appLinks(a).hasLinks));
    setRecent(readRecentApps());
  }, [open, loading, groups, location.pathname, location.search, appLinks]);

  const push = (s: Step) => { setDir('push'); setStack((st) => [...st, s]); };
  const pop = () => { setDir('pop'); setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)); };
  const top = stack[stack.length - 1] ?? ROOT;
  const parent = stack.length > 1 ? stack[stack.length - 2] : null;

  const groupFor = (key: string) => groups.find((g) => hubKeyOf(g) === key) ?? null;
  const titleOf = (s: Step): string => {
    if (s.kind === 'root') return 'Apps';
    if (s.kind === 'hub') return groupFor(s.key)?.hub?.label ?? MORE_LABEL;
    return byId.get(s.id)?.label ?? 'App';
  };
  const subtitleOf = (s: Step): string | undefined => {
    if (s.kind === 'hub') return groupFor(s.key) ? (groupFor(s.key)!.hub?.description ?? MORE_DESCRIPTION) : undefined;
    if (s.kind === 'app') return byId.get(s.id)?.description;
    return undefined;
  };

  // Every navigation closes the panel; opening an APP also records it as recent.
  const leave = (appId?: string) => {
    if (appId) pushRecentApp(appId);
    onOpenChange(false);
  };

  const onEnable = async (app: LauncherApp) => {
    const res = await enable(app);
    toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
  };

  // A pushed step is a new view: move focus to its heading so a screen reader announces it and
  // the next Tab starts from the top of the new list rather than wherever the old one was.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open, stack]);

  const recentApps = recent.map((id) => byId.get(id)).filter((a): a is LauncherApp => !!a && a.active);

  const renderLocked = (app: LauncherApp) => (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-muted-foreground">
        <app.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">{app.label}</span>
          <Lock className="h-3 w-3 shrink-0" />
        </span>
        {app.description && <span className="block text-xs leading-snug text-muted-foreground line-clamp-1">{app.description}</span>}
      </span>
      <Button size="sm" variant="secondary" className="shrink-0" disabled={enabling === app.moduleSlug} onClick={() => onEnable(app)}>
        {enabling === app.moduleSlug
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <><Plus className="h-4 w-4" />{app.priceLabel ?? (canManage ? 'Enable' : 'Request')}</>}
      </Button>
    </div>
  );

  const renderRoot = () => (
    <>
      {recentApps.length > 0 && (
        <section className="px-4">
          <GroupLabel>Recent</GroupLabel>
          <div className="grid grid-cols-4 gap-2">
            {recentApps.map((app) => (
              <Link
                key={app.id}
                to={app.path}
                onClick={() => leave(app.id)}
                className="flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border border-hairline bg-card px-1 py-2 text-center transition-colors active:bg-surface-hover"
              >
                <app.icon className="h-5 w-5 text-primary" />
                <span className="line-clamp-2 w-full text-[11px] leading-tight text-foreground">{app.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <GroupLabel className="px-4">Hubs</GroupLabel>
        {groups.length > 0 ? (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {groups.map((g) => {
              const key = hubKeyOf(g);
              return (
                <li key={key}>
                  <MenuRow
                    icon={g.hub?.icon ?? LayoutGrid}
                    label={g.hub?.label ?? MORE_LABEL}
                    hint={g.hub?.description ?? MORE_DESCRIPTION}
                    hintLines={2}
                    meta={String(g.apps.length)}
                    trailing="chevron"
                    onClick={() => push({ kind: 'hub', key })}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="border-y border-hairline px-4 py-5 text-sm text-muted-foreground">
            No apps are enabled in this workspace yet.{' '}
            <Link to="/profile?tab=modules" onClick={() => leave()} className="text-primary underline underline-offset-2">Browse modules</Link>
          </p>
        )}
      </section>

      <section className="pt-4">
        <ul className="divide-y divide-hairline border-y border-hairline">
          <li><MenuRow icon={Wrench} label="Tools" hint="Scanners, calculators & agent tools" trailing="open" to="/tools" onClick={() => leave()} /></li>
          <li><MenuRow icon={LifeBuoy} label="Help & Support" hint="Guides & answers" trailing="open" to="/knowledge-base" onClick={() => leave()} /></li>
          <li><MenuRow icon={Settings} label="Preferences" hint="Your account & workspace" trailing="open" to="/profile" onClick={() => leave()} /></li>
          <li><MenuRow icon={Check} label="Manage modules" hint="Enable, price & cancel" trailing="open" to="/profile?tab=modules" onClick={() => leave()} /></li>
        </ul>
      </section>

      <div className="px-4">
        <MobileInstallButton onDone={() => onOpenChange(false)} />
      </div>
    </>
  );

  const renderHub = (key: string) => {
    const group = groupFor(key);
    if (!group) {
      return <p className="px-4 py-6 text-sm text-muted-foreground">This hub has no apps for you.</p>;
    }
    const shortcuts = hubShortcuts(group.hub?.id ?? null);
    return (
      <>
        <ul className="divide-y divide-hairline border-b border-hairline">
          {group.apps.map((app) => {
            if (!app.active) return <li key={app.id}>{renderLocked(app)}</li>;
            const links = appLinks(app);
            return (
              <li key={app.id}>
                <MenuRow
                  icon={app.icon}
                  iconTone="primary"
                  label={app.label}
                  hint={app.description}
                  trailing={links.hasLinks ? 'none' : 'open'}
                  to={app.path}
                  onClick={() => leave(app.id)}
                  accessory={links.hasLinks ? (
                    <button
                      type="button"
                      aria-label={`${app.label} sections`}
                      onClick={() => push({ kind: 'app', id: app.id })}
                      className="flex w-12 items-center justify-center text-muted-foreground transition-colors active:bg-surface-hover"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : undefined}
                />
              </li>
            );
          })}
        </ul>
        {shortcuts.length > 0 && (
          <section>
            <GroupLabel className="px-4">Jump to</GroupLabel>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {shortcuts.map((s) => (
                <li key={s.to}><MenuRow icon={s.icon} label={s.label} trailing="open" to={s.to} onClick={() => leave()} /></li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  };

  const renderApp = (id: string) => {
    const app = byId.get(id);
    if (!app) return <p className="px-4 py-6 text-sm text-muted-foreground">This app is no longer available.</p>;
    const { sections, actions, quickStarts } = appLinks(app);
    return (
      <>
        <ul className="border-b border-hairline">
          <li><MenuRow icon={ArrowUpRight} iconTone="primary" emphasis label={`Open ${app.label}`} to={app.path} onClick={() => leave(app.id)} /></li>
        </ul>
        {actions.length > 0 && (
          <section>
            <GroupLabel className="px-4">Create</GroupLabel>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {actions.map((a) => (
                <li key={a.to}><MenuRow icon={Plus} iconTone="primary" label={a.label} trailing="open" to={a.to} onClick={() => leave(app.id)} /></li>
              ))}
            </ul>
          </section>
        )}
        {sections.length > 0 && (
          <section>
            <GroupLabel className="px-4">In {app.label}</GroupLabel>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {sections.map((s) => (
                <li key={s.to}><MenuRow icon={s.icon} label={s.label} trailing="open" to={s.to} onClick={() => leave(app.id)} /></li>
              ))}
            </ul>
          </section>
        )}
        {quickStarts.length > 0 && (
          <section>
            <GroupLabel className="px-4">Quick starts</GroupLabel>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {quickStarts.map((qs) => (
                <li key={qs.to}><MenuRow icon={Sparkles} iconTone="primary" label={qs.label} hint={qs.description} trailing="open" to={qs.to} onClick={() => leave(app.id)} /></li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  };

  const subtitle = subtitleOf(top);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        aria-describedby={undefined}
        // Full height in dvh (a fixed inset-y-0 box sits under Safari's bottom toolbar); leaves a
        // sliver of the page visible so the overlay reads as "tap here to dismiss".
        className="flex h-[100dvh] w-[min(calc(100vw_-_2.75rem),24rem)] flex-col gap-0 overflow-y-hidden border-l border-hairline bg-sidebar p-0 data-[state=open]:duration-300"
      >
        <header className="shrink-0 border-b border-hairline bg-sidebar pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1 px-2">
            {parent ? (
              <button
                type="button"
                onClick={pop}
                aria-label={`Back to ${titleOf(parent)}`}
                className="flex h-10 min-w-0 items-center gap-0.5 rounded-sm pl-1 pr-2 text-sm text-primary transition-colors active:bg-surface-hover"
              >
                <ChevronLeft className="h-5 w-5 shrink-0" />
                <span className="max-w-[6.5rem] truncate">{titleOf(parent)}</span>
              </button>
            ) : (
              <span className="w-2" aria-hidden="true" />
            )}
            <SheetTitle ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 truncate text-base font-semibold outline-none">
              {titleOf(top)}
            </SheetTitle>
            <SheetClose
              aria-label="Close menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors active:bg-surface-hover"
            >
              <X className="h-5 w-5" />
            </SheetClose>
          </div>
          {subtitle && <p className="-mt-1 px-4 pb-3 text-xs leading-snug text-muted-foreground">{subtitle}</p>}
        </header>

        {/* Keyed on the step so a push/pop remounts the body: it starts scrolled to the top and the
            enter animation plays in the direction of travel. */}
        <div
          key={stack.map(stepKey).join('/')}
          className={cn(
            'flex-1 overflow-y-auto pb-[calc(1rem_+_env(safe-area-inset-bottom))] animate-in fade-in-0 duration-200 motion-reduce:animate-none',
            dir === 'push' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : top.kind === 'root' ? renderRoot() : top.kind === 'hub' ? renderHub(top.key) : renderApp(top.id)}
        </div>
      </SheetContent>
    </Sheet>
  );
};
