import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { HubEmptyState, HubSegmented, HubToolbar } from '@/components/core/hub';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { timeAgo } from '@/utils/datetime';
import { resolveNotificationTarget, type NotificationTarget } from '@/utils/notificationLink';

import { NotificationIcon } from '../components/NotificationIcon';

const PAGE_SIZE = 50;

type View = 'all' | 'unread';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
] as const;

/** The full history behind the bell, which only ever shows the newest few. */
export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let query = supabase
      .from('user_notifications')
      .select('id, type, title, body, action_url, is_read, created_at', { count: 'exact' })
      .eq('user_id', user.id);
    if (view === 'unread') query = query.eq('is_read', false);
    query
      .order('created_at', { ascending: false })
      .range(0, limit - 1)
      .then(({ data, count, error }) => {
        if (cancelled) return;
        setFailed(!!error);
        if (!error) {
          setRows((data ?? []) as NotificationRow[]);
          setTotal(count ?? 0);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, view, limit, tick]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user.id}` },
        reload,
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, reload]);

  const changeView = (next: View) => {
    setView(next);
    setLimit(PAGE_SIZE);
    setLoading(true);
  };

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) setFailed(true);
    else reload();
  };

  const open = async (row: NotificationRow, target: NotificationTarget) => {
    if (!row.is_read) {
      await supabase.from('user_notifications').update({ is_read: true }).eq('id', row.id);
    }
    if (target.kind === 'route') navigate(target.to);
    else if (target.kind === 'external') window.open(target.href, '_blank', 'noopener,noreferrer');
    reload();
  };

  return (
    <div>
      <PageHeader icon={Bell} title="Notifications" subtitle="Everything the platform has told you" />
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        <div className="dashboard-card overflow-hidden">
          <HubToolbar
            filters={(
              <HubSegmented options={VIEWS} value={view} onChange={changeView} aria-label="Which notifications" />
            )}
            actions={(
              <Button variant="outline" size="sm" onClick={markAllRead}>
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                Mark all read
              </Button>
            )}
          />

          {failed ? (
            <HubEmptyState
              icon={AlertTriangle}
              title="Could not load your notifications"
              description="This is a loading problem. It does not mean you have none."
              action={<Button variant="outline" onClick={reload}>Try again</Button>}
            />
          ) : loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            view === 'unread' ? (
              <HubEmptyState
                variant="filtered"
                icon={Bell}
                title="Nothing unread"
                description="You have read every notification."
                action={<Button variant="outline" onClick={() => changeView('all')}>Show all</Button>}
              />
            ) : (
              <HubEmptyState
                icon={Bell}
                title="No notifications yet"
                description="Automations decide what reaches you here."
                action={<Button variant="outline" onClick={() => navigate('/flows')}>Open Automations</Button>}
              />
            )
          ) : (
            <div className="divide-y divide-hairline">
              {rows.map((row) => {
                const target = resolveNotificationTarget(row.action_url);
                const canOpen = target.kind !== 'none';
                return (
                  <div
                    key={row.id}
                    {...(canOpen ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => { void open(row, target); },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void open(row, target); }
                      },
                    } : {})}
                    className={`flex items-start gap-3 px-4 py-3 ${canOpen ? 'cursor-pointer hover:bg-accent/50' : ''} ${row.is_read ? '' : 'bg-primary/5'}`}
                  >
                    <div className="mt-0.5 shrink-0"><NotificationIcon type={row.type} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-sm leading-snug break-words min-w-0 ${row.is_read ? 'text-foreground/80' : 'font-semibold text-foreground'}`}>
                          {row.title}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground" title={new Date(row.created_at).toLocaleString()}>
                          {timeAgo(row.created_at)}
                        </span>
                      </div>
                      {row.body && (
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground whitespace-pre-line break-words">{row.body}</p>
                      )}
                    </div>
                    {!row.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                );
              })}
            </div>
          )}

          {!failed && !loading && rows.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-hairline bg-surface-sunken px-4 py-2">
              <span className="text-xs text-muted-foreground tabular-nums">Showing {rows.length} of {total}</span>
              {rows.length < total && (
                <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>Show more</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
