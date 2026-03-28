import React, { useState, useEffect } from 'react';
import { User, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { NotificationsPanel } from '@/components/core/NotificationsPanel';
import { supabase } from '@/integrations/supabase/client';

interface PageHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** Custom action buttons rendered left of notifications (e.g. "New MoodBoard") */
  actions?: React.ReactNode;
  /** Extra content rendered below the title row (e.g. search/filter bar) */
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, actions, children }: PageHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      })
      .catch((err) => console.warn('[PageHeader] Failed to load avatar:', err));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count ?? 0);
    };

    fetchUnread();

    const channel = supabase
      .channel('pageheader-notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${user.id}`,
      }, fetchUnread)
      .subscribe();

    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [user]);

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <section
      className="relative overflow-hidden mx-2 sm:mx-4 rounded-[2rem] px-3 sm:px-6 py-4 sm:py-5"
      style={{
        background: 'linear-gradient(135deg, hsl(330,43%,13%) 0%, hsl(315,38%,22%) 50%, hsl(290,28%,32%) 100%)',
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(320,55%,55%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-16 -right-8 w-72 h-72 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, hsl(280,45%,55%) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative flex items-center justify-between gap-4">
        {/* Left: page icon + title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-light text-white tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-white/65 mt-0.5 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: custom actions + notifications + avatar */}
        <div className="flex items-center gap-3 shrink-0 [&_button]:text-white [&_button]:hover:bg-white/10">
          {actions && <div className="flex items-center gap-2">{actions}</div>}

          <NotificationsPanel unreadCount={unreadCount} onCountChange={setUnreadCount} />

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9 border-2 border-white/30">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile" />}
                    <AvatarFallback
                      className="font-semibold text-xs"
                      style={{ background: 'var(--mocha-color)' }}
                    >
                      {user.email ? getInitials(user.email) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 rounded-xl" align="end" forceMount>
                <DropdownMenuItem disabled className="py-3">
                  <User className="mr-3 h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')} className="py-3">
                  <User className="mr-3 h-4 w-4" />
                  <span className="text-sm">My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut()}
                  className="py-3 text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  <span className="text-sm">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {children && <div className="mt-4 relative">{children}</div>}
    </section>
  );
}
