import React, { useEffect, useState } from 'react';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { flowEventService } from '@/services/flows/flowEventService';

interface FollowButtonProps {
  targetUserId: string;
  currentUserId?: string;
  onToggle?: (nowFollowing: boolean) => void;
}

export const FollowButton: React.FC<FollowButtonProps> = ({ targetUserId, currentUserId, onToggle }) => {
  const { toast } = useToast();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(!!currentUserId && currentUserId !== targetUserId);

  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) {
      setLoading(false);
      return;
    }
    checkFollow();
  }, [currentUserId, targetUserId]);

  const checkFollow = async () => {
    const { data } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', currentUserId!)
      .eq('following_id', targetUserId)
      .maybeSingle();

    setFollowing(!!data);
    setLoading(false);
  };

  const toggle = async () => {
    if (!currentUserId) {
      toast({ title: 'Sign in to follow', description: 'Create an account to follow creators.' });
      return;
    }
    setLoading(true);
    if (following) {
      await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetUserId);
      setFollowing(false);
      onToggle?.(false);
    } else {
      await supabase
        .from('user_follows')
        .insert({ follower_id: currentUserId, following_id: targetUserId });
      setFollowing(true);
      onToggle?.(true);
      // Recipient notification is delivered by the "Profile Followed" flow.
      // The event carries the full notification payload so the flow can
      // template it; an admin can pause/edit it without a code change.
      flowEventService.emit('profile_followed', {
        user_id: targetUserId, // recipient — consumed by create_notification
        type: 'new_follower',
        title: 'You have a new follower',
        body: '',
        action_url: '/profile?tab=profile',
        follower_id: currentUserId,
        following_id: targetUserId,
        followed_at: new Date().toISOString(),
      });
    }
    setLoading(false);
  };

  // Don't show for own profile
  if (currentUserId && currentUserId === targetUserId) return null;

  return (
    <Button
      variant={following ? 'outline' : 'default'}
      size="default"
      onClick={toggle}
      disabled={loading}
      className="rounded-full gap-2"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {following ? 'Following' : 'Follow'}
    </Button>
  );
};
