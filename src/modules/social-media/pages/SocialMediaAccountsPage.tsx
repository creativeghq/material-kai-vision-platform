/**
 * SocialMediaAccountsPage (Admin view)
 *
 * Read-only overview of all social accounts connected by workspace members.
 * Individual users connect/disconnect their own accounts from My Profile → Social Accounts.
 */
import React, { useState, useEffect } from 'react';
import { Share2, Users, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Button } from '@/components/core/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';

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

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', facebook: '👥', linkedin: '💼', tiktok: '🎵',
  pinterest: '📌', youtube: '▶️', twitter: '𝕏', threads: '🧵',
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const SocialMediaAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, [user]);

  const loadAccounts = async () => {
    if (!user) return;
    setLoading(true);

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('workspace_id', membership.workspace_id)
      .order('connected_at', { ascending: false });

    if (error) {
      toast({ title: 'Failed to load accounts', description: error.message, variant: 'destructive' });
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  };

  const activeAccounts = accounts.filter(a => a.is_active);
  const platformCounts = activeAccounts.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <PageHeader
        icon={Share2}
        title="Social Media Accounts"
        subtitle="Overview of all social accounts connected by team members"
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">

        {/* Info banner */}
        <div className="dashboard-card flex items-start gap-3 text-sm">
          <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium">Personal account connections</p>
            <p className="text-muted-foreground mt-0.5">
              Each team member connects their own social accounts from{' '}
              <button
                onClick={() => navigate('/profile?tab=social-accounts')}
                className="underline text-primary hover:text-primary/80"
              >
                My Profile → Social Accounts
              </button>
              . This page shows a workspace-wide overview.
            </p>
          </div>
        </div>

        {/* Platform summary badges */}
        {!loading && activeAccounts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(platformCounts).map(([platform, count]) => (
              <Badge key={platform} variant="outline" className="gap-1.5 px-3 py-1">
                <span>{PLATFORM_EMOJI[platform] ?? '🔗'}</span>
                <span className="capitalize">{platform}</span>
                <span className="text-muted-foreground">×{count}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Accounts table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>
                {activeAccounts.length} active account{activeAccounts.length !== 1 ? 's' : ''} across the workspace
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="rounded-full" onClick={loadAccounts}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-md animate-pulse bg-muted/40" />
                ))}
              </div>
            ) : activeAccounts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Share2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No social accounts connected yet.</p>
                <p className="text-xs mt-1">
                  Team members can connect from{' '}
                  <button onClick={() => navigate('/profile?tab=social-accounts')} className="underline">
                    their profile
                  </button>.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead>Followers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Synced</TableHead>
                    <TableHead>Connected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map(account => (
                    <TableRow key={account.id} className={!account.is_active ? 'opacity-40' : ''}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="text-lg">{PLATFORM_EMOJI[account.platform] ?? '🔗'}</span>
                          <span className="capitalize text-sm">{account.platform}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.handle ? `@${account.handle}` : account.display_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.followers_count > 0 ? (
                          <span className="flex items-center gap-1">
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
                      <TableCell className="text-xs text-muted-foreground">
                        {timeAgo(account.last_synced_at)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(account.connected_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
