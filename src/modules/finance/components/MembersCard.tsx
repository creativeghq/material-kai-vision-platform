/**
 * Workspace members list, surfaced inside Finance → Settings → Team (alongside the
 * invite card). Replaces the standalone /settings → Members tab so members are viewed
 * and managed from one place. Invite + referral links live on /network.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Users, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const MembersCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // workspace_members has no FK to user_profiles, so PostgREST can't embed it.
        // Fetch members, then resolve their profiles in a second query and join in JS.
        const { data: members, error } = await supabase
          .from('workspace_members')
          .select('user_id, role, status')
          .eq('workspace_id', workspaceId)
          .order('role');
        if (error) throw error;
        const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean);
        let profilesById: Record<string, { full_name: string | null; email: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('user_id, full_name, email')
            .in('user_id', userIds);
          profilesById = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, { full_name: p.full_name, email: p.email }]));
        }
        setRows((members ?? []).map((m) => ({ ...m, profile: profilesById[m.user_id] ?? null })));
      } catch (err: any) {
        toast({ title: 'Failed to load members', description: err?.message, variant: 'destructive' });
      } finally { setLoading(false); }
    })();
  }, [workspaceId, toast]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Members ({rows.length})</CardTitle>
        <Link to="/network"><Button size="sm" variant="outline" className="rounded-full">Invite &amp; referral links <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button></Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : rows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">No members.</div>
          : (
            <div className="divide-y divide-border/40">
              {rows.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}</div>
                    {m.profile?.email && <div className="text-xs text-muted-foreground">{m.profile.email}</div>}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
};
