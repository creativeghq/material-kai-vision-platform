import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import { formatDate } from '@/utils/datetime';

interface Connection { site_url: string; username: string; site_name: string | null; verified_at: string | null; enabled: boolean }

export async function callSeoPublish<T = Record<string, unknown>>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('seo-publish', { body });
  if (error) throw new Error(await edgeErrorMessage(error, fallback));
  if (data?.success === false) throw new Error(String(data.error ?? fallback));
  return data as T;
}

export const WordPressConnectionCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [form, setForm] = useState({ site_url: '', username: '', application_password: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('workspace_wordpress_credentials' as never)
      .select('site_url, username, site_name, verified_at, enabled').eq('workspace_id', workspaceId).maybeSingle();
    if (error) { toast({ title: 'Could not read the WordPress connection', description: error.message, variant: 'destructive' }); }
    setConn((data as Connection | null) ?? null);
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const connect = async (disconnect = false) => {
    setBusy(true);
    try {
      await callSeoPublish({ action: 'wordpress_connect', workspace_id: workspaceId, ...(disconnect ? { disconnect: true } : form) }, 'Could not connect WordPress');
      toast({ title: disconnect ? 'WordPress disconnected' : 'WordPress connected', description: disconnect ? undefined : 'Articles can now be published to it.' });
      setForm({ site_url: '', username: '', application_password: '' });
      await load();
    } catch (e) {
      toast({ title: disconnect ? 'Not disconnected' : 'Not connected', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> WordPress</CardTitle>
        <CardDescription>
          Publish SEO articles straight to your own site as a draft or a live post. Create an application password in
          WordPress under Users → Profile → Application Passwords; your normal password is never used.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {conn === undefined ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : conn ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="success">Connected</Badge>
            <span className="text-sm">{conn.site_name ? `${conn.site_name} · ` : ''}{conn.site_url}</span>
            <span className="text-xs text-muted-foreground">as {conn.username}{conn.verified_at ? `, verified ${formatDate(conn.verified_at)}` : ''}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void connect(true)} disabled={busy}>Disconnect</Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="wp-site">Site address</Label>
              <Input id="wp-site" placeholder="https://example.com" value={form.site_url} onChange={(e) => setForm({ ...form, site_url: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-user">Username</Label>
              <Input id="wp-user" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-pass">Application password</Label>
              <Input id="wp-pass" type="password" autoComplete="new-password" value={form.application_password}
                onChange={(e) => setForm({ ...form, application_password: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <Button onClick={() => void connect()} disabled={busy || !form.site_url || !form.username || !form.application_password}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Verify and connect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
