import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, FileText, Building2, ArrowRight } from 'lucide-react';

import { useRecentActivity, type ActivityKind } from './useDashboardBlocks';

const KIND_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  order: ShoppingCart,
  quote: FileText,
  company: Building2,
};

/** Compact relative time. Absolute date past a week — "34 days ago" is worse
 *  than the date itself once you are outside recent memory. */
function since(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Rows always occupy the same box, loaded or not — see the height note in
 *  StatBlock. This sits directly above LatestWidgets, so any growth here pushes
 *  four more cards down the page. */
const SLOTS = 7;

export const RecentActivity: React.FC = () => {
  const { items, loading } = useRecentActivity();

  return (
    <div className="dashboard-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm">Recent Activity</h3>
        <Link
          to="/crm"
          className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* `relative` so the empty state can sit centred OVER the reserved slots
          instead of replacing them — replacing them would collapse the card and
          push LatestWidgets up the page the moment the feed resolves empty. */}
      <div className="relative">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
        {Array.from({ length: SLOTS }).map((_, i) => {
          const item = loading ? null : items[i];

          if (loading) {
            return (
              <div key={i} className="flex items-center gap-2.5 h-9 animate-pulse">
                <span className="w-7 h-7 rounded-lg bg-primary/10 shrink-0" />
                <span className="h-2.5 bg-primary/10 rounded flex-1" />
              </div>
            );
          }
          if (!item) {
            // Empty slot: holds its height so the grid never resizes as the feed
            // fills. Hidden from assistive tech — there is nothing to announce.
            return <div key={i} aria-hidden="true" className="h-9" />;
          }

          const Icon = KIND_ICON[item.kind];
          return (
            <Link
              key={item.id}
              to={item.to}
              className="group flex items-center gap-2.5 h-9 min-w-0 rounded-lg -mx-1.5 px-1.5 hover:bg-white/5 transition-colors"
            >
              <span className="w-7 h-7 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-tight truncate">{item.title}</span>
                <span className="block text-[11px] text-muted-foreground truncate capitalize">
                  {item.detail}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {since(item.at)}
              </span>
            </Link>
          );
        })}
        </div>

        {!loading && items.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Nothing has moved yet.
          </p>
        )}
      </div>
    </div>
  );
};
