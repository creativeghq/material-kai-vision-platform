import React from 'react';
import { ChevronDown, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';

interface HubRecordLayoutProps {
  /** Left rail: identity card + property panels. ~300px, scrolls with the page. */
  left: React.ReactNode;
  /** Centre column: the activity/timeline/tabs. Takes all remaining width. */
  children: React.ReactNode;
  /** Right rail: associated records. Omit for a two-column record. */
  right?: React.ReactNode;
  className?: string;
}

/**
 * RECORD LAYOUT — the three-column shell for a single record (contact, company,
 * deal, order, property).
 *
 * The columns are not decoration; each answers a different question, and mixing
 * them is what turns a record page into a wall:
 *
 *   left    WHO/WHAT is this        — identity + stored fields
 *   centre  WHAT HAPPENED           — activity, notes, emails, tasks
 *   right   WHAT IS IT CONNECTED TO — deals, tickets, companies, files
 *
 * The rails are fixed-width and the centre is fluid, because the rails hold
 * label/value pairs (which have a natural width and look broken stretched) while
 * the centre holds prose and lists (which want the room). Below `lg` the whole
 * thing stacks in that same order — identity, then activity, then associations —
 * which is also the order of decreasing usefulness on a phone.
 */
export const HubRecordLayout: React.FC<HubRecordLayoutProps> = ({
  left,
  children,
  right,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col gap-4 p-4 lg:flex-row lg:items-start',
      className,
    )}
  >
    <aside className="w-full shrink-0 space-y-3 lg:w-[300px] xl:w-[320px]">{left}</aside>

    {/* min-w-0 is load-bearing: without it a wide table or a long unbroken token
        in the centre column sets the flex basis and shoves the right rail off
        the viewport instead of scrolling inside its own container. */}
    <div className="min-w-0 flex-1 space-y-3">{children}</div>

    {right && <aside className="w-full shrink-0 space-y-3 lg:w-[300px] xl:w-[320px]">{right}</aside>}
  </div>
);

interface HubRecordIdentityProps {
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
  /** Falls back to initials derived from `name`. */
  initials?: string;
  /** Quick actions under the name (note, email, call, task…). */
  actions?: React.ReactNode;
  /** Badges/tags under the subtitle (lifecycle stage, owner, type). */
  meta?: React.ReactNode;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The identity card at the top of the left rail: avatar, name, role, actions.
 * Centred rather than left-aligned — this is the one block on the page whose
 * job is "you are looking at THIS record", and centring it stops it reading as
 * just another property row in the panel below.
 */
export const HubRecordIdentity: React.FC<HubRecordIdentityProps> = ({
  name,
  subtitle,
  avatarUrl,
  initials,
  actions,
  meta,
}) => (
  <div className="rounded-md border border-hairline bg-card p-4 text-center">
    <Avatar className="mx-auto h-16 w-16">
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
        {initials ?? initialsOf(name)}
      </AvatarFallback>
    </Avatar>

    <h2 className="mt-2.5 break-words font-sans text-base font-semibold leading-tight text-foreground">
      {name}
    </h2>
    {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}

    {meta && <div className="mt-2 flex flex-wrap items-center justify-center gap-1">{meta}</div>}

    {actions && (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">{actions}</div>
    )}
  </div>
);

interface HubPanelProps {
  title: React.ReactNode;
  /** Rendered right of the title — a count, an "+ Add", a link out. */
  action?: React.ReactNode;
  /** Start collapsed. Only meaningful when `collapsible`. */
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * A rail panel: small header, hairline, body. `collapsible` turns the header
 * into a disclosure button.
 *
 * A record page routinely carries 8–12 of these. That is exactly why the header
 * is 12px semibold and not a card title — twelve 16px headings down a 300px rail
 * is a table of contents, not a record.
 */
export const HubPanel: React.FC<HubPanelProps> = ({
  title,
  action,
  defaultOpen = true,
  collapsible = false,
  children,
  className,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  const body = <div className="p-3">{children}</div>;

  return (
    <section className={cn('overflow-hidden rounded-md border border-hairline bg-card', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !open && '-rotate-90')}
              aria-hidden="true"
            />
            <span className="truncate">{title}</span>
          </button>
        ) : (
          <h3 className="truncate font-sans text-xs font-semibold text-foreground">{title}</h3>
        )}
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {(!collapsible || open) && body}
    </section>
  );
};

/** "+ Add deal" — the standard rail-panel action. */
export const HubPanelAddAction: React.FC<{ label: string; onClick?: () => void }> = ({
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-0.5 rounded-xs text-xs font-semibold text-primary hover:underline"
  >
    <Plus className="h-3 w-3" aria-hidden="true" />
    {label}
  </button>
);

interface HubPropertyProps {
  label: string;
  children: React.ReactNode;
  /** Stack label above value (the default) or put them side by side. */
  layout?: 'stacked' | 'inline';
}

/**
 * One stored field: label + value.
 *
 * Stacked by default. A side-by-side label/value pair inside a 300px rail
 * leaves ~140px for the value, so every email address, address line and company
 * name truncates — and a truncated value in a properties panel is worse than no
 * panel, because it looks like the data is short rather than clipped.
 *
 * An absent value renders an em dash, never an empty line: "we have no phone
 * number" and "this row failed to render" must not look the same.
 */
export const HubProperty: React.FC<HubPropertyProps> = ({ label, children, layout = 'stacked' }) => {
  const empty = children === null || children === undefined || children === '';
  const value = empty ? <span className="text-muted-foreground">—</span> : children;

  if (layout === 'inline') {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
        <dd className="min-w-0 break-words text-right text-sm text-foreground">{value}</dd>
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
};

/** Wrapper for a run of <HubProperty> — supplies the <dl> and row rhythm. */
export const HubPropertyList: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <dl className={cn('divide-y divide-hairline', className)}>{children}</dl>;
