/**
 * Messaging Channels Tab
 * Connect + manage WhatsApp sender numbers via Zernio (Meta Cloud API).
 * A channel = a connected Zernio WhatsApp account (WABA phone number).
 *
 * Connecting goes through Meta Embedded Signup, brokered by Zernio — the same one-click
 * flow the social accounts tab uses. No Meta access token is ever typed into this app.
 * Pasting WABA credentials by hand still exists behind "already have Meta credentials",
 * because Zernio documents that endpoint for server-to-server callers who hold them.
 */

import React, { useState, useEffect } from 'react';
import { Plus, MessageCircle, Check, Trash2, Edit2, RefreshCw, Download, Loader2, KeyRound, AlertTriangle, Webhook } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/core/ui/dialog';
import { Switch } from '@/components/core/ui/switch';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingChannel } from '../services';
import type { WhatsAppOnboardingMode, ZernioWebhookStatus } from '../services/types';
import { formatNumber } from '@/utils/decimal';

export const MessagingChannelsTab: React.FC = () => {
  const [channels, setChannels] = useState<MessagingChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState<WhatsAppOnboardingMode | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [showOnboardingPicker, setShowOnboardingPicker] = useState(false);
  const [webhook, setWebhook] = useState<ZernioWebhookStatus | null>(null);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [editingChannel, setEditingChannel] = useState<MessagingChannel | null>(null);
  const { toast } = useToast();

  useEffect(() => { loadChannels(); loadWebhook(); }, []);

  // Zernio only delivers to a webhook it has been told about. Nothing ever registered ours,
  // so replies, delivery receipts and number-health events had nowhere to land — and that is
  // invisible from here, because "no inbound messages" looks exactly the same.
  const loadWebhook = async () => {
    try {
      setWebhook(await messagingService.getWebhookStatus());
    } catch {
      // Not configured / no key yet — the 503 path already tells the operator what to do.
      setWebhook(null);
    }
  };

  // Zernio returns the browser here after Embedded Signup with
  // ?connected=whatsapp&accountId=<id>&profileId=&username=<phone>. Channels is this page's
  // DEFAULT tab, so this component is mounted when the redirect lands — if that default ever
  // changes, the redirect below must carry the tab or the callback is silently never processed
  // (exactly the bug that bit the social accounts tab).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const accountId = params.get('accountId');
    if (connected !== 'whatsapp' || !accountId) return;

    (async () => {
      try {
        await messagingService.finishWhatsAppOAuth({ zernioAccountId: accountId });
        toast({ title: 'WhatsApp connected', description: params.get('username') || undefined });
        await loadChannels();
      } catch (error: any) {
        console.error('Error finishing WhatsApp connection:', error);
        toast({
          title: 'Could not finish connecting',
          description: error?.message || String(error),
          variant: 'destructive',
        });
      } finally {
        const clean = new URL(window.location.href);
        ['connected', 'accountId', 'username', 'profileId', 'state'].forEach((k) => clean.searchParams.delete(k));
        window.history.replaceState({}, '', clean.toString());
      }
    })();
  }, []);

  const loadChannels = async () => {
    try {
      setLoading(true);
      setChannels(await messagingService.getChannels());
    } catch (error) {
      console.error('Error loading channels:', error);
      toast({ title: 'Error', description: 'Failed to load WhatsApp channels', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Remove this WhatsApp channel? (The number stays connected in Zernio.)')) return;
    try {
      await messagingService.deleteChannel(id);
      toast({ title: 'Success', description: 'Channel removed' });
      loadChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      toast({ title: 'Error', description: 'Failed to remove channel', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (channel: MessagingChannel) => {
    try {
      await messagingService.updateChannel(channel.id, { is_active: !channel.is_active });
      toast({ title: 'Success', description: `Channel ${channel.is_active ? 'deactivated' : 'activated'}` });
      loadChannels();
    } catch (error) {
      console.error('Error updating channel:', error);
      toast({ title: 'Error', description: 'Failed to update channel', variant: 'destructive' });
    }
  };

  const handleSetDefault = async (channel: MessagingChannel) => {
    try {
      await messagingService.updateChannel(channel.id, { is_default: true });
      toast({ title: 'Success', description: 'Default channel updated' });
      loadChannels();
    } catch (error) {
      console.error('Error setting default channel:', error);
      toast({ title: 'Error', description: 'Failed to set default channel', variant: 'destructive' });
    }
  };

  const handleRegisterWebhook = async () => {
    try {
      setRegisteringWebhook(true);
      const status = await messagingService.registerWebhook();
      setWebhook(status);
      toast({
        title: status.outcome === 'unchanged' ? 'Already registered' : 'Webhook registered',
        description: status.outcome === 'updated'
          ? 'Re-enabled and re-subscribed to every event we handle.'
          : 'Zernio will now deliver replies and delivery receipts.',
      });
    } catch (error: any) {
      toast({
        title: 'Could not register the webhook',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const handleConnect = async (onboarding: WhatsAppOnboardingMode) => {
    setShowOnboardingPicker(false);
    try {
      setConnecting(onboarding);
      const { oauth_url } = await messagingService.startWhatsAppOAuth({
        onboarding,
        // Come back to this exact page so the callback effect above runs.
        redirectUrl: `${window.location.origin}${window.location.pathname}`,
      });
      window.open(oauth_url, '_blank', 'noopener,noreferrer');
      toast({
        title: 'Continue in the new tab',
        description: 'Pick your WhatsApp Business account and number on Meta, then come back here.',
      });
    } catch (error: any) {
      console.error('Error starting WhatsApp connection:', error);
      toast({
        title: 'Could not start the connection',
        description: error?.message || 'Failed to reach Zernio',
        variant: 'destructive',
      });
    } finally {
      setConnecting(null);
    }
  };

  const handleSyncChannels = async () => {
    try {
      setSyncing(true);
      const result = await messagingService.syncChannels();
      toast({
        title: result.synced > 0 ? 'Sync Complete' : 'No Accounts Found',
        description: result.message || `Synced ${result.synced} WhatsApp account(s) from Zernio`,
      });
      loadChannels();
    } catch (error: any) {
      console.error('Error syncing channels:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync from Zernio. Check your ZERNIO_API_KEY.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">Loading channels...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        title="WhatsApp Channels"
        subtitle="Connect WhatsApp Business numbers via Zernio (Meta Cloud API)"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadChannels} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleSyncChannels} disabled={syncing}>
              <Download className={`h-4 w-4 mr-2 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Zernio'}
            </Button>
            <Button onClick={() => setShowOnboardingPicker(true)} disabled={Boolean(connecting)}>
              {connecting
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Plus className="h-4 w-4 mr-2" />}
              Connect WhatsApp
            </Button>
          </div>
        }
      />

      {/* Delivery registration — a connected number with no webhook receives nothing back. */}
      {webhook && !(webhook.registered && webhook.isActive !== false && !webhook.missingEvents?.length) && (
        <div className="dashboard-card border-amber-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-sm">
                {!webhook.registered
                  ? 'Zernio is not delivering events to this app'
                  : webhook.isActive === false
                    ? 'Zernio disabled this webhook'
                    : 'This webhook is missing events'}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {!webhook.registered
                  ? 'Incoming replies, delivery receipts and number-health alerts will not arrive until the webhook is registered.'
                  : webhook.isActive === false
                    ? `Delivery is off after ${webhook.failureCount ?? 'repeated'} consecutive failures. Registering again re-enables it.`
                    : `Not subscribed to: ${webhook.missingEvents?.join(', ')}.`}
              </p>
              {!webhook.secretConfigured && (
                <p className="text-sm text-amber-500 mt-1">
                  Set <code>ZERNIO_WEBHOOK_SECRET</code> first — the handler rejects unsigned deliveries.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={handleRegisterWebhook}
              disabled={registeringWebhook || !webhook.secretConfigured}
            >
              {registeringWebhook
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Webhook className="h-4 w-4 mr-2" />}
              {webhook.registered ? 'Repair' : 'Register'}
            </Button>
          </div>
        </div>
      )}

      {/* Channels List */}
      {channels.length === 0 ? (
        <div className="dashboard-card">
          <div className="py-12 text-center">
            <MessageCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No WhatsApp numbers connected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect a WhatsApp Business number to start sending. You'll sign in with Meta and
              pick the number there — nothing to copy across.
            </p>
            <Button onClick={() => setShowOnboardingPicker(true)} disabled={Boolean(connecting)}>
              {connecting
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Plus className="h-4 w-4 mr-2" />}
              Connect WhatsApp
            </Button>
            <div className="mt-4">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowConnect(true)}>
                <KeyRound className="h-3 w-3 mr-2" />
                I already have Meta credentials
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <div key={channel.id} className="dashboard-card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <h4 className="font-semibold">{channel.display_name || channel.sender_id}</h4>
                    <p className="text-sm text-muted-foreground">{channel.sender_id}</p>
                  </div>
                </div>
                <Badge variant={channel.is_active ? 'default' : 'secondary'}>
                  {channel.config?.needs_reconnection
                    ? 'Reconnect'
                    : channel.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {channel.config?.needs_reconnection && (
                <p className="text-xs text-amber-500 mb-3 flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  Meta invalidated this number&apos;s token. Sends will fail until you connect it again.
                </p>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="capitalize">{channel.provider}</span>
                </div>
                {channel.config?.waba_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WABA</span>
                    <span className="font-mono text-xs truncate max-w-[150px]">{channel.config.waba_id}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Quota</span>
                  <span>{formatNumber(channel.daily_quota)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate Limit</span>
                  <span>{channel.max_send_rate}/min</span>
                </div>
                {channel.is_default && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Default</span>
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Switch checked={channel.is_active} onCheckedChange={() => handleToggleActive(channel)} />
                  <span className="text-sm text-muted-foreground">
                    {channel.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!channel.is_default && (
                    <Button variant="ghost" size="sm" onClick={() => handleSetDefault(channel)} title="Set as default">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditingChannel(channel)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteChannel(channel.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showOnboardingPicker && (
        <OnboardingPickerModal
          onClose={() => setShowOnboardingPicker(false)}
          onPick={handleConnect}
        />
      )}
      {showConnect && (
        <ConnectWhatsAppModal
          onClose={() => setShowConnect(false)}
          onSuccess={() => { setShowConnect(false); loadChannels(); }}
        />
      )}
      {editingChannel && (
        <EditChannelModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSuccess={() => { setEditingChannel(null); loadChannels(); }}
        />
      )}
    </div>
  );
};

// ── Which Embedded Signup screen Meta should show ──────────────────────
// Not a preference: the two produce differently-provisioned numbers. Zernio defaults to
// coexistence when the parameter is omitted, which is the wrong default for a business
// connecting a Cloud API number — and silently so, because both paths "work".
const OnboardingPickerModal: React.FC<{
  onClose: () => void;
  onPick: (mode: WhatsAppOnboardingMode) => void;
}> = ({ onClose, onPick }) => (
  <Dialog open onOpenChange={onClose}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Connect WhatsApp</DialogTitle>
        <DialogDescription>
          You&apos;ll finish on Meta&apos;s own screen. Which describes your number?
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onPick('business_app')}
          className="dashboard-card w-full text-left hover:border-primary/50 transition-colors"
        >
          <p className="font-medium text-sm">It&apos;s on the WhatsApp Business app</p>
          <p className="text-xs text-muted-foreground mt-1">
            Keep using the app on your phone and send from here too. Meta calls this coexistence.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onPick('api')}
          className="dashboard-card w-full text-left hover:border-primary/50 transition-colors"
        >
          <p className="font-medium text-sm">It&apos;s a dedicated business number</p>
          <p className="text-xs text-muted-foreground mt-1">
            A new number, or one already on the WhatsApp Cloud API. Meta shows its account and
            number picker.
          </p>
        </button>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ── Connect WhatsApp (Meta credentials → Zernio account) ───────────────
const ConnectWhatsAppModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ accessToken: '', wabaId: '', phoneNumberId: '', displayName: '' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accessToken || !form.wabaId || !form.phoneNumberId) {
      toast({ title: 'Error', description: 'Access token, WABA ID and phone number ID are required', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      await messagingService.connectWhatsApp(form);
      toast({ title: 'Connected', description: 'WhatsApp number connected via Zernio' });
      onSuccess();
    } catch (error: any) {
      console.error('Error connecting WhatsApp:', error);
      toast({ title: 'Connection failed', description: error.message || 'Failed to connect WhatsApp', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with Meta credentials</DialogTitle>
          <DialogDescription>
            Only needed if you already hold a permanent token — otherwise close this and use
            <strong> Connect WhatsApp</strong>, which signs you in with Meta instead. Token:
            Business Suite → System Users; WABA ID + Phone Number ID: WhatsApp Manager.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Permanent Access Token</Label>
            <Input value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} placeholder="EAAB..." />
          </div>
          <div className="space-y-2">
            <Label>WABA ID</Label>
            <Input value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} placeholder="123456789012345" />
          </div>
          <div className="space-y-2">
            <Label>Phone Number ID</Label>
            <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} placeholder="987654321098765" />
          </div>
          <div className="space-y-2">
            <Label>Display Name (optional)</Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Support line" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Connecting...' : 'Connect'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ── Edit a connected channel (display name / quota / rate) ──────────────
const EditChannelModal: React.FC<{ channel: MessagingChannel; onClose: () => void; onSuccess: () => void }> = ({ channel, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    display_name: channel.display_name || '',
    daily_quota: channel.daily_quota || 10000,
    max_send_rate: channel.max_send_rate || 100,
    is_active: channel.is_active,
    is_default: channel.is_default,
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await messagingService.updateChannel(channel.id, form);
      toast({ title: 'Success', description: 'Channel updated' });
      onSuccess();
    } catch (error) {
      console.error('Error saving channel:', error);
      toast({ title: 'Error', description: 'Failed to save channel', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Channel</DialogTitle>
          <DialogDescription>{channel.sender_id}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Support line" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Daily Quota</Label>
              <Input type="number" value={form.daily_quota} onChange={(e) => setForm({ ...form, daily_quota: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Rate Limit (per min)</Label>
              <Input type="number" value={form.max_send_rate} onChange={(e) => setForm({ ...form, max_send_rate: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={(c) => setForm({ ...form, is_default: c })} />
              <Label>Set as default</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Update'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MessagingChannelsTab;
