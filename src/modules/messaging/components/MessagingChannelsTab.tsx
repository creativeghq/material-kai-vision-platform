/**
 * Messaging Channels Tab
 * Configure SMS and WhatsApp sender channels via Twilio
 */

import React, { useState, useEffect } from 'react';
import { Plus, Phone, MessageCircle, Check, Trash2, Edit2, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/core/ui/dialog';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingChannel, MessagingChannelType } from '../services';

const channelIcons: Record<MessagingChannelType, React.ReactNode> = {
  sms: <Phone className="h-5 w-5" />,
  whatsapp: <MessageCircle className="h-5 w-5 text-green-500" />,
};

const channelLabels: Record<MessagingChannelType, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export const MessagingChannelsTab: React.FC = () => {
  const [channels, setChannels] = useState<MessagingChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<MessagingChannel | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getChannels();
      setChannels(data);
    } catch (error) {
      console.error('Error loading channels:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messaging channels',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;

    try {
      await messagingService.deleteChannel(id);
      toast({
        title: 'Success',
        description: 'Channel deleted successfully',
      });
      loadChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete channel',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (channel: MessagingChannel) => {
    try {
      await messagingService.updateChannel(channel.id, {
        is_active: !channel.is_active,
      });
      toast({
        title: 'Success',
        description: `Channel ${channel.is_active ? 'deactivated' : 'activated'}`,
      });
      loadChannels();
    } catch (error) {
      console.error('Error updating channel:', error);
      toast({
        title: 'Error',
        description: 'Failed to update channel',
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (channel: MessagingChannel) => {
    try {
      await messagingService.updateChannel(channel.id, {
        is_default: true,
      });
      toast({
        title: 'Success',
        description: 'Default channel updated',
      });
      loadChannels();
    } catch (error) {
      console.error('Error setting default channel:', error);
      toast({
        title: 'Error',
        description: 'Failed to set default channel',
        variant: 'destructive',
      });
    }
  };

  const handleSyncChannels = async () => {
    try {
      setSyncing(true);
      const result = await messagingService.syncChannels();

      if (result.synced > 0) {
        toast({
          title: 'Sync Complete',
          description: result.message || `Synced ${result.synced} channel(s) from Twilio`,
        });
      } else {
        toast({
          title: 'No Channels Found',
          description: result.message || 'No channels found in Twilio. You can manually add channels using the Add Channel button.',
        });
      }

      if (result.errors && result.errors.length > 0) {
        console.warn('Sync warnings:', result.errors);
      }

      loadChannels();
    } catch (error: any) {
      console.error('Error syncing channels:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync channels from Twilio. Check your API credentials.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">
          Loading channels...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Messaging Channels</h3>
            <p className="text-sm text-muted-foreground">
              Configure sender IDs for SMS and WhatsApp via Twilio
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadChannels} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleSyncChannels} disabled={syncing}>
              <Download className={`h-4 w-4 mr-2 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Twilio'}
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          </div>
        </div>
      </div>

      {/* Channels List */}
      {channels.length === 0 ? (
        <div className="dashboard-card">
          <div className="py-12 text-center">
            <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No channels configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first messaging channel to get started with Twilio
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Channel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <div key={channel.id} className="dashboard-card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {channelIcons[channel.channel_type]}
                  <div>
                    <h4 className="font-semibold">{channel.display_name || channel.sender_id}</h4>
                    <p className="text-sm text-muted-foreground">{channel.sender_id}</p>
                  </div>
                </div>
                <Badge variant={channel.is_active ? 'default' : 'secondary'}>
                  {channel.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span>{channelLabels[channel.channel_type]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="capitalize">{channel.provider}</span>
                </div>
                {channel.channel_type === 'whatsapp' && channel.config?.messaging_service_sid && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messaging Service</span>
                    <span className="font-mono text-xs truncate max-w-[150px]">{channel.config.messaging_service_sid}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Quota</span>
                  <span>{channel.daily_quota.toLocaleString()}</span>
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
                  <Switch
                    checked={channel.is_active}
                    onCheckedChange={() => handleToggleActive(channel)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {channel.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!channel.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(channel)}
                      title="Set as default"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingChannel(channel)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteChannel(channel.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingChannel) && (
        <ChannelModal
          channel={editingChannel}
          onClose={() => {
            setShowCreateModal(false);
            setEditingChannel(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingChannel(null);
            loadChannels();
          }}
        />
      )}
    </div>
  );
};

// Channel Modal Component
interface ChannelModalProps {
  channel: MessagingChannel | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ChannelModal: React.FC<ChannelModalProps> = ({ channel, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    channel_type: channel?.channel_type || 'sms' as MessagingChannelType,
    sender_id: channel?.sender_id || '',
    display_name: channel?.display_name || '',
    daily_quota: channel?.daily_quota || 10000,
    max_send_rate: channel?.max_send_rate || 100,
    is_active: channel?.is_active ?? true,
    is_default: channel?.is_default ?? false,
    // Twilio-specific config
    messaging_service_sid: channel?.config?.messaging_service_sid || '',
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sender_id) {
      toast({
        title: 'Error',
        description: 'Phone number is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // Build config object based on channel type
      const config: Record<string, any> = {};
      if (formData.channel_type === 'whatsapp' && formData.messaging_service_sid) {
        config.messaging_service_sid = formData.messaging_service_sid;
      }

      const channelData = {
        channel_type: formData.channel_type,
        sender_id: formData.sender_id,
        display_name: formData.display_name,
        daily_quota: formData.daily_quota,
        max_send_rate: formData.max_send_rate,
        is_active: formData.is_active,
        is_default: formData.is_default,
        config,
      };

      if (channel) {
        await messagingService.updateChannel(channel.id, channelData);
        toast({
          title: 'Success',
          description: 'Channel updated successfully',
        });
      } else {
        await messagingService.createChannel({
          ...channelData,
          provider: 'twilio',
        });
        toast({
          title: 'Success',
          description: 'Channel created successfully',
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving channel:', error);
      toast({
        title: 'Error',
        description: 'Failed to save channel',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {channel ? 'Edit Channel' : 'Add Messaging Channel'}
          </DialogTitle>
          <DialogDescription>
            Configure a Twilio messaging channel for SMS or WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Channel Type</Label>
            <Select
              value={formData.channel_type}
              onValueChange={(value) => setFormData({ ...formData, channel_type: value as MessagingChannelType })}
              disabled={!!channel}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input
              value={formData.sender_id}
              onChange={(e) => setFormData({ ...formData, sender_id: e.target.value })}
              placeholder="+1234567890"
            />
            <p className="text-xs text-muted-foreground">
              Your Twilio phone number in E.164 format
            </p>
          </div>

          {/* WhatsApp-specific: Messaging Service SID */}
          {formData.channel_type === 'whatsapp' && (
            <div className="space-y-2">
              <Label>Messaging Service SID (Optional)</Label>
              <Input
                value={formData.messaging_service_sid}
                onChange={(e) => setFormData({ ...formData, messaging_service_sid: e.target.value })}
                placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Twilio Messaging Service SID for WhatsApp (found in Twilio Console)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Display Name (Optional)</Label>
            <Input
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="Marketing SMS"
            />
            <p className="text-xs text-muted-foreground">
              Friendly name shown in the admin panel
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Daily Quota</Label>
              <Input
                type="number"
                value={formData.daily_quota}
                onChange={(e) => setFormData({ ...formData, daily_quota: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate Limit (per min)</Label>
              <Input
                type="number"
                value={formData.max_send_rate}
                onChange={(e) => setFormData({ ...formData, max_send_rate: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
              <Label>Set as default</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : channel ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MessagingChannelsTab;
