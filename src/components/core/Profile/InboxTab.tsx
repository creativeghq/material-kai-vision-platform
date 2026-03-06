import React, { useEffect, useState } from 'react';
import { Mail, Inbox, Trash2, Loader2, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ContactRequest {
  id: string;
  from_name: string;
  from_email: string;
  message: string;
  created_at: string;
  services_requested?: string[] | null;
  is_read: boolean;
}

export const InboxTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadMessages();
  }, [user]);

  const loadMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profile_contact_requests')
      .select('*')
      .eq('to_user_id', user!.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMessages(data as ContactRequest[]);
      // Mark all unread as read
      const unreadIds = (data as ContactRequest[]).filter((m) => !m.is_read).map((m) => m.id);
      if (unreadIds.length > 0) {
        supabase
          .from('profile_contact_requests')
          .update({ is_read: true })
          .in('id', unreadIds)
          .then(() => {});
      }
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('profile_contact_requests')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Could not delete message.', variant: 'destructive' });
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            Hire Me Inbox
            {messages.length > 0 && (
              <Badge variant="secondary">{messages.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No messages yet.</p>
              <p className="text-xs mt-1">When someone contacts you via your public profile, it'll appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl border p-4 space-y-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2">
                      {!msg.is_read && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                      <div className="min-w-0">
                      <p className="font-medium text-sm">{msg.from_name}</p>
                      <a
                        href={`mailto:${msg.from_email}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {msg.from_email}
                      </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{fmt(msg.created_at)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(msg.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {msg.services_requested && msg.services_requested.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> Interested in:
                      </span>
                      {msg.services_requested.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs px-2 py-0">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p
                    className={`text-sm text-muted-foreground leading-relaxed cursor-pointer ${expanded === msg.id ? '' : 'line-clamp-2'}`}
                    onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                  >
                    {msg.message}
                  </p>
                  {msg.message.length > 120 && (
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                    >
                      {expanded === msg.id ? 'Show less' : 'Read more'}
                    </button>
                  )}
                  <div className="pt-1">
                    <a href={`mailto:${msg.from_email}?subject=Re: Your inquiry`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                        <Mail className="h-3 w-3" />
                        Reply via email
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
