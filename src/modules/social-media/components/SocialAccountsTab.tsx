import React, { useState, useEffect } from 'react';
import { Share2, Plus, Trash2, Loader2, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { statusTone } from '@/utils/statusTone';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { supabaseConfig } from '@/config/apis/supabaseConfig';
import { SectionHeader } from '@/components/shared/SectionHeader';

const SUPABASE_FUNCTIONS_URL = `${supabaseConfig.projectUrl}/functions/v1`;

interface SocialAccount {
  id: string;
  platform: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number;
  is_active: boolean;
  last_synced_at: string | null;
  connected_at: string;
}

const PLATFORMS = [
  { id: 'instagram',  label: 'Instagram',  emoji: '📸' },
  { id: 'facebook',   label: 'Facebook',   emoji: '👥' },
  { id: 'linkedin',   label: 'LinkedIn',   emoji: '💼' },
  { id: 'tiktok',     label: 'TikTok',     emoji: '🎵' },
  { id: 'pinterest',  label: 'Pinterest',  emoji: '📌' },
  { id: 'youtube',    label: 'YouTube',    emoji: '▶️' },
  { id: 'twitter',    label: 'Twitter / X', emoji: '𝕏' },
  { id: 'threads',    label: 'Threads',    emoji: '🧵' },
];

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const SocialAccountsTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setWorkspaceId(data?.workspace_id ?? null));
    loadAccounts();
  }, [user]);

  // Zernio redirects the OAuth tab back here with ?connected=<platform>&accountId=<id>.
  // This tab shares the user's Supabase session, so we persist the account via the
  // edge function callback, then clean the URL.
  useEffect(() => {
    if (!user || !workspaceId) return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const accountId = params.get('accountId');
    if (!connected || !accountId) return;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // `fetch` only rejects on a NETWORK failure — every HTTP error status resolves
        // normally. The response was never read and res.ok never checked, so the success
        // toast fired on 403 ('Not a member of this workspace'), 500 (upsert failure) and 503
        // (ZERNIO_API_KEY missing). The user was told the account connected, loadAccounts()
        // then showed nothing, and no error existed anywhere to explain it. The same file
        // does this correctly 70 lines down. (audit #306 finding 17)
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/zernio-api`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'callback',
            zernio_account_id: accountId,
            platform: connected,
            workspace_id: workspaceId,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => res.statusText);
          throw new Error(detail || `Connect failed (${res.status})`);
        }
        toast({ title: `${connected} connected` });
        await loadAccounts();
      } catch (err: any) {
        toast({ title: 'Could not finish connecting', description: err?.message ?? String(err), variant: 'destructive' });
      } finally {
        // Strip the Zernio OAuth params from the URL.
        const clean = new URL(window.location.href);
        ['connected', 'accountId', 'username', 'profileId', 'social_connected'].forEach(k => clean.searchParams.delete(k));
        window.history.replaceState({}, '', clean.toString());
      }
    })();
  }, [user, workspaceId]);

  const loadAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('connected_at', { ascending: false });

    if (error) {
      toast({ title: 'Failed to load accounts', description: error.message, variant: 'destructive' });
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  };

  const handleConnect = async (platform: string) => {
    if (!user) return;
    if (!workspaceId) {
      toast({ title: 'Workspace not found', description: 'Could not determine your workspace. Please refresh.', variant: 'destructive' });
      return;
    }
    setConnecting(platform);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/zernio-api`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'connect',
          platform,
          workspace_id: workspaceId,
          // Zernio redirects back here after OAuth; this tab finishes the connection.
          // MUST point at the social-accounts tab (not bare /profile) — otherwise the user
          // lands on the default Profile tab, this component never mounts, and the
          // ?connected=&accountId= callback that persists the account is never processed.
          redirect_url: `${window.location.origin}${window.location.pathname}?tab=social-accounts`,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to get OAuth URL');

      // Open Zernio OAuth in a new tab
      window.open(result.oauth_url, '_blank', 'noopener,noreferrer');

      toast({
        title: `Connect ${platform}`,
        description: 'Complete the authorisation in the new tab, then refresh this page.',
      });
    } catch (err: any) {
      toast({ title: 'Connection failed', description: err.message, variant: 'destructive' });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string, platform: string) => {
    setDisconnecting(accountId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/zernio-api`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'disconnect', social_account_id: accountId }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to disconnect');

      setAccounts(prev => prev.filter(a => a.id !== accountId));
      toast({ title: `${platform} disconnected` });
    } catch (err: any) {
      toast({ title: 'Failed to disconnect', description: err.message, variant: 'destructive' });
    } finally {
      setDisconnecting(null);
    }
  };

  const connectedPlatformIds = new Set(accounts.map(a => a.platform));

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dashboard-card h-20 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={Share2} title="Social Accounts" subtitle="Connect the accounts you publish to." />

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Connected</h3>
          {accounts.map(account => {
            const platform = PLATFORMS.find(p => p.id === account.platform);
            return (
              <div key={account.id} className="dashboard-card flex items-center gap-4">
                <span className="text-2xl">{platform?.emoji ?? '🔗'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{platform?.label ?? account.platform}</p>
                    <span className={`text-[10px] capitalize ${statusTone('connected')}`}>
                      Connected
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {account.handle ? `@${account.handle}` : account.display_name ?? '—'}
                    {account.followers_count > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {formatFollowers(account.followers_count)}
                      </span>
                    )}
                    <span className="ml-2">· synced {timeAgo(account.last_synced_at)}</span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleDisconnect(account.id, platform?.label ?? account.platform)}
                  disabled={disconnecting === account.id}
                >
                  {disconnecting === account.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Available platforms to connect */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {accounts.length > 0 ? 'Add another account' : 'Connect an account'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLATFORMS.filter(p => !connectedPlatformIds.has(p.id)).map(platform => (
            <div key={platform.id} className="dashboard-card flex items-center gap-3">
              <span className="text-2xl">{platform.emoji}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{platform.label}</p>
                <p className="text-xs text-muted-foreground">Not connected</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => handleConnect(platform.id)}
                disabled={connecting === platform.id}
              >
                {connecting === platform.id
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  : <Plus className="h-3 w-3 mr-1" />}
                Connect
              </Button>
            </div>
          ))}
        </div>

        {PLATFORMS.every(p => connectedPlatformIds.has(p.id)) && (
          <p className="text-sm text-muted-foreground text-center py-4">
            All platforms connected! 🎉
          </p>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="rounded-full text-muted-foreground"
        onClick={loadAccounts}
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        Refresh
      </Button>
    </div>
  );
};
