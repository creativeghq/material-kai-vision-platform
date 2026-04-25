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
import { ModuleHeaderActions } from '@/modules/_core';
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

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <section className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/8">
      <div className="flex items-center justify-between gap-4">
        {/* Left: page icon + title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-light text-foreground tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: custom actions + notifications + avatar */}
        <div className="flex items-center gap-3 shrink-0">
          {actions && <div className="flex items-center gap-2">{actions}</div>}

          <ModuleHeaderActions />

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9 border-2 border-white/10">
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

      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}
