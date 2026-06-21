import React, { useEffect, useState } from 'react';
import { MessageCircle, Send, Trash2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { flowEventService } from '@/services/flows/flowEventService';
import { initials } from '@/lib/materialCategories';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  user_profiles?: { full_name?: string; avatar_url?: string } | null;
}

interface MoodboardCommentsProps {
  moodboardId: string;
  currentUserId?: string;
}

export const MoodboardComments: React.FC<MoodboardCommentsProps> = ({
  moodboardId,
  currentUserId,
}) => {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    loadComments();
  }, [moodboardId]);

  const loadComments = async () => {
    const { data } = await supabase
      .from('moodboard_comments')
      .select('id, content, created_at, user_id, user_profiles(full_name, avatar_url)')
      .eq('moodboard_id', moodboardId)
      .order('created_at', { ascending: true });

    if (data) setComments(data as Comment[]);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentUserId) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from('moodboard_comments')
      .insert({ moodboard_id: moodboardId, user_id: currentUserId, content: text.trim() })
      .select('id, content, created_at, user_id, user_profiles(full_name, avatar_url)')
      .single();

    if (error) {
      toast({ title: 'Error', description: 'Could not post comment.', variant: 'destructive' });
    } else {
      setComments((prev) => [...prev, data as Comment]);
      const snippet = text.trim().slice(0, 100);
      setText('');
      // Notify the moodboard owner (unless they're commenting on their own board).
      const { data: mb } = await supabase
        .from('moodboards').select('user_id, title').eq('id', moodboardId).maybeSingle();
      const ownerId = mb?.user_id && mb.user_id !== currentUserId ? mb.user_id : null;
      flowEventService.emit('moodboard_commented', {
        moodboard_id: moodboardId,
        comment_id: data.id,
        commenter_id: currentUserId,
        content_snippet: snippet,
        ...(ownerId ? {
          user_id: ownerId, // recipient — consumed by create_notification
          type: 'moodboard_commented',
          title: `New comment on "${mb?.title || 'your moodboard'}"`,
          body: snippet,
          action_url: `/moodboard/${moodboardId}`,
        } : {}),
      });
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('moodboard_comments').delete().eq('id', id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
        <MessageCircle className="h-4 w-4" />
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground">No comments yet. Be the first!</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                {c.user_profiles?.avatar_url && (
                  <AvatarImage src={c.user_profiles.avatar_url} />
                )}
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {initials(c.user_profiles?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold">
                    {c.user_profiles?.full_name || 'User'}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmt(c.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5 break-words">{c.content}</p>
              </div>
              {currentUserId === c.user_id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {currentUserId ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            rows={1}
            className="resize-none flex-1 min-h-0 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" size="sm" disabled={submitting || !text.trim()} className="self-end">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Sign in to leave a comment.</p>
      )}
    </div>
  );
};
