import React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { useDisplayProfile } from '@/hooks/useDisplayProfile';
import { initials } from '@/lib/materialCategories';
import { cn } from '@/lib/utils';

export interface UserAvatarProps {
  userId?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  fallback?: React.ReactNode;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  name,
  avatarUrl,
  className,
  fallbackClassName,
  fallback,
}) => {
  const resolved = useDisplayProfile(avatarUrl ? null : userId);
  const src = avatarUrl ?? resolved?.avatarUrl ?? null;
  const label = name ?? resolved?.fullName ?? null;
  const text = label ? initials(label) : null;

  return (
    <Avatar className={cn('h-8 w-8', className)}>
      {src && <AvatarImage src={src} alt={label ?? ''} className="object-cover" />}
      <AvatarFallback className={cn('text-xs font-medium', fallbackClassName)}>
        {text || fallback || null}
      </AvatarFallback>
    </Avatar>
  );
};

export default UserAvatar;
