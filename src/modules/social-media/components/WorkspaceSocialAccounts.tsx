/**
 * Workspace-wide roster of connected social accounts — who on the team has connected what.
 *
 * Extracted from SocialMediaAccountsPage so the standalone route and the Profile → Social Accounts
 * rail render the SAME component. Two copies of a table is how one of them quietly stops matching
 * the other; the page is now a PageHeader around this.
 *
 * Read-only on purpose: an account belongs to the person who authorised it, and a colleague
 * revoking someone else's Instagram from an overview screen is not an overview.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Share2, RefreshCw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';
import { PlatformIcon, platformLabel } from '@/components/core/icons/PlatformIcon';

interface SocialAccount {
  id: string;
  platform: string;
  handle: string | null;
  display_name: string | null;
  followers_count: number;
  is_active: boolean;
  last_synced_at: string | null;
  connected_at: string;
  user_id: string;
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const WorkspaceSocialAccounts: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('workspace_id', activeWorkspaceId)
      .order('connected_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load accounts', description: error.message, variant: 'destructive' });
    } else {
      setAccounts((data ?? []) as SocialAccount[]);
    }
    setLoading(false);
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const activeAccounts = accounts.filter(a => a.is_active);
  const platformCounts = activeAccounts.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {!loading && activeAccounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(platformCounts).map(([platform, count]) => (
            <Badge key={platform} variant="outline" className="gap-1.5 px-3 py-1">
              <PlatformIcon platform={platform} className="h-3.5 w-3.5 shrink-0" />
              <span>{platformLabel(platform)}</span>
              <span className="text-muted-foreground">×{count}</span>
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Connected accounts</CardTitle>
            <CardDescription>
              {activeAccounts.length} active account{activeAccounts.length !== 1 ? 's' : ''} across the workspace.
              Each person connects their own from My accounts.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded-sm animate-pulse bg-muted/40" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-4">
              <HubEmptyState
                variant="empty"
                icon={Share2}
                title="Nobody has connected an account yet"
                description="Social accounts are authorised per person, so the first one has to come from a team member's own profile."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/profile?tab=social-accounts&section=accounts">Connect mine</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead className="text-right">Followers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last synced</TableHead>
                    <TableHead>Connected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map(account => (
                    <TableRow key={account.id} className={!account.is_active ? 'opacity-40' : ''}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <PlatformIcon platform={account.platform} className="h-4 w-4 shrink-0" />
                          <span className="text-sm">{platformLabel(account.platform)}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.handle ? `@${account.handle}` : account.display_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {account.followers_count > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {formatFollowers(account.followers_count)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={`text-[10px] capitalize ${account.is_active ? statusTone('active') : 'text-muted-foreground'}`}>
                          {account.is_active ? 'Active' : 'Disconnected'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(account.last_synced_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(account.connected_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkspaceSocialAccounts;
