import React, { useEffect, useRef, useState } from 'react';
import { timeAgo } from '@/utils/datetime';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Inbox, Calendar, Star, Bot, CheckCheck, X, Sparkles, FileText, Building2,
  Globe, Video, Layers, Cpu, Download, CreditCard, XCircle, UserPlus, CheckCircle,
  Megaphone, BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  hire_me:                <Inbox className="h-4 w-4 text-primary" />,
  appointment_booked:     <Calendar className="h-4 w-4 text-amber-500" />,
  appointment_confirmed:  <Calendar className="h-4 w-4 text-green-500" />,
  appointment_cancelled:  <Calendar className="h-4 w-4 text-destructive" />,
  review_received:        <Star className="h-4 w-4 text-amber-400" />,
  agent_completed:        <Bot className="h-4 w-4 text-primary" />,
  material_alert:         <Sparkles className="h-4 w-4 text-primary" />,
  quote_updated:          <FileText className="h-4 w-4 text-violet-500" />,
  preferred_factory:      <Building2 className="h-4 w-4 text-blue-500" />,
  ambassadorship:         <BadgeCheck className="h-4 w-4 text-blue-500" />,
  vr_world_ready:         <Globe className="h-4 w-4 text-emerald-500" />,
  vr_world_failed:        <Globe className="h-4 w-4 text-destructive" />,
  video_ready:            <Video className="h-4 w-4 text-emerald-500" />,
  video_failed:           <Video className="h-4 w-4 text-destructive" />,
  staging_ready:          <Layers className="h-4 w-4 text-emerald-500" />,
  agent_run_done:         <Cpu className="h-4 w-4 text-emerald-500" />,
  agent_run_failed:       <Cpu className="h-4 w-4 text-destructive" />,
  pdf_ready:              <Download className="h-4 w-4 text-violet-500" />,
  svbrdf_ready:           <Sparkles className="h-4 w-4 text-emerald-500" />,
  factory_approved:       <CheckCircle className="h-4 w-4 text-green-500" />,
  factory_rejected:       <XCircle className="h-4 w-4 text-destructive" />,
  quote_accepted:         <FileText className="h-4 w-4 text-green-500" />,
  quote_rejected:         <FileText className="h-4 w-4 text-destructive" />,
  new_follower:           <UserPlus className="h-4 w-4 text-blue-500" />,
  payment_success:        <CreditCard className="h-4 w-4 text-green-500" />,
  payment_failed:         <CreditCard className="h-4 w-4 text-destructive" />,
  changelog_published:    <Megaphone className="h-4 w-4 text-primary" />,
};


export const NotificationsPanel: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number; width: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Pull unread count on mount; subscribe to realtime changes on
  // user_notifications for this user — refresh badge when rows arrive
  // or get marked read elsewhere.
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const { count } = await supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (!cancelled) setUnreadCount(count ?? 0);
    };
    refresh();
    const channel = supabase
      .channel(`notifications-bell-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => { refresh(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inTrigger = triggerRef.current?.contains(target);
      if (!inPanel && !inTrigger) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Load notifications when panel opens
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (!cancelled) setNotifications((data ?? []) as UserNotification[]);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleClick = async (n: UserNotification) => {
    // Mark as read
    if (!n.is_read) {
      await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', n.id);
      setNotifications((prev) =>
        prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setOpen(false);
    if (n.action_url) navigate(n.action_url);
  };

  const dismissOne = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await supabase.from('user_notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Cap the panel to the viewport (with 8px gutters) and clamp its right
      // offset so it never spills past the left edge on narrow screens — the
      // bell sits mid-bar, so a fixed 320px panel anchored to it would otherwise
      // run off-screen on mobile.
      const width = Math.min(320, window.innerWidth - 16);
      const rawRight = window.innerWidth - rect.right;
      const right = Math.min(Math.max(rawRight, 8), window.innerWidth - width - 8);
      setPanelPos({
        top: rect.bottom + window.scrollY + 8,
        right,
        width,
      });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={triggerRef}>
      {/* Bell trigger */}
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 hover:bg-white/10 relative"
        onClick={handleToggle}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Panel */}
      {open && panelPos && createPortal(
        <div ref={panelRef} style={{ position: 'absolute', top: panelPos.top, right: panelPos.right, width: panelPos.width, zIndex: 99999 }} className="rounded-2xl border bg-card shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={markAllRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y">
            {loading ? (
              <div className="py-10 text-center text-xs text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Bell className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-accent/50 transition-colors group cursor-pointer ${!n.is_read ? 'bg-primary/5' : ''}`}
                  onClick={() => handleClick(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(n); } }}
                >
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICON[n.type] ?? <Bell className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs leading-snug ${!n.is_read ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                        {!n.is_read && (
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                            onClick={(e) => dismissOne(e, n.id)}
                            title="Dismiss"
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                    {n.body && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                        {n.body}
                      </p>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-4 py-2 bg-muted/30">
              <button
                className="text-xs text-primary hover:underline w-full text-center"
                onClick={() => { setOpen(false); navigate('/profile?tab=inbox'); }}
              >
                View inbox
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
