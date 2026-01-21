/**
 * Messaging Channels Tab
 * Configure SMS, WhatsApp, and Viber sender channels
 */

import React, { useState, useEffect } from 'react';
import { Plus, Phone, MessageCircle, Smartphone, Check, X, Trash2, Edit2, RefreshCw, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/core/ui/dialog';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingChannel, MessagingChannelType } from '@/services/messaging';

const channelIcons: Record<MessagingChannelType, React.ReactNode> = {
  sms: <Phone className="h-5 w-5" />,
  whatsapp: <MessageCircle className="h-5 w-5 text-green-500" />,
  viber: <Smartphone className="h-5 w-5 text-purple-500" />,
};

const channelLabels: Record<MessagingChannelType, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
};

export const MessagingChannelsTab: React.FC = () => {
  const [channels, setChannels] = useState<MessagingChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [infobipSenders, setInfobipSenders] = useState<{
    sms: Array<{ sender_id: string; display_name: string; status: string }>;
    whatsapp: Array<{ sender_id: string; display_name: string; status: string; quality_rating?: string }>;
    viber: Array<{ sender_id: string; display_name: string; status: string }>;
  } | null>(null);
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

  const handleSyncFromInfobip = async () => {
    try {
      setSyncing(true);
      const result = await messagingService.syncSendersFromInfobip(false);
      setInfobipSenders(result.senders);
      setShowSyncModal(true);

      if (result.total === 0) {
        toast({
          title: 'No senders found',
          description: 'No SMS, WhatsApp, or Viber senders are configured in your Infobip account.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error syncing from Infobip:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to fetch senders from Infobip. Please check your API key.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleImportSender = async (channelType: MessagingChannelType, sender: { sender_id: string; display_name: string; status: string }) => {
    try {
      // Check if already exists
      const existing = channels.find(c => c.channel_type === channelType && c.sender_id === sender.sender_id);
      if (existing) {
        toast({
          title: 'Already exists',
          description: 'This sender is already configured.',
        });
        return;
      }

      await messagingService.createChannel({
        channel_type: channelType,
        provider: 'infobip',
        sender_id: sender.sender_id,
        display_name: sender.display_name,
        is_active: sender.status === 'active' || sender.status === 'ACTIVE',
        is_default: channels.filter(c => c.channel_type === channelType).length === 0,
        config: { imported_from_infobip: true },
        daily_quota: 10000,
        max_send_rate: channelType === 'sms' ? 100 : 30,
      });

      toast({
        title: 'Imported',
        description: `${sender.display_name || sender.sender_id} has been added.`,
      });

      loadChannels();
    } catch (error) {
      console.error('Error importing sender:', error);
      toast({
        title: 'Error',
        description: 'Failed to import sender',
        variant: 'destructive',
      });
    }
  };

  const handleImportAll = async () => {
    if (!infobipSenders) return;

    try {
      setSyncing(true);
      await messagingService.syncSendersFromInfobip(true);
      toast({
        title: 'Import complete',
        description: 'All senders have been imported from Infobip.',
      });
      setShowSyncModal(false);
      loadChannels();
    } catch (error) {
      console.error('Error importing all senders:', error);
      toast({
        title: 'Error',
        description: 'Failed to import senders',
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
              Configure sender IDs for SMS, WhatsApp, and Viber
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSyncFromInfobip} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Infobip'}
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Manually
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
              Add your first messaging channel to get started
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

      {/* Sync from Infobip Modal */}
      {showSyncModal && infobipSenders && (
        <Dialog open onOpenChange={() => setShowSyncModal(false)}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Infobip Senders</DialogTitle>
              <DialogDescription>
                These are the senders configured in your Infobip account. Click to import them.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* SMS Senders */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <Phone className="h-4 w-4" />
                  SMS Senders ({infobipSenders.sms.length})
                </h4>
                {infobipSenders.sms.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No SMS senders found</p>
                ) : (
                  <div className="space-y-2">
                    {infobipSenders.sms.map((sender, i) => {
                      const exists = channels.some(c => c.channel_type === 'sms' && c.sender_id === sender.sender_id);
                      return (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{sender.display_name || sender.sender_id}</p>
                            <p className="text-sm text-muted-foreground">{sender.sender_id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={sender.status === 'active' || sender.status === 'ACTIVE' ? 'default' : 'secondary'}>
                              {sender.status}
                            </Badge>
                            {exists ? (
                              <Badge variant="outline" className="text-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Imported
                              </Badge>
                            ) : (
                              <Button size="sm" onClick={() => handleImportSender('sms', sender)}>
                                <Download className="h-3 w-3 mr-1" />
                                Import
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* WhatsApp Senders */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  WhatsApp Senders ({infobipSenders.whatsapp.length})
                </h4>
                {infobipSenders.whatsapp.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No WhatsApp senders found</p>
                ) : (
                  <div className="space-y-2">
                    {infobipSenders.whatsapp.map((sender, i) => {
                      const exists = channels.some(c => c.channel_type === 'whatsapp' && c.sender_id === sender.sender_id);
                      return (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{sender.display_name || sender.sender_id}</p>
                            <p className="text-sm text-muted-foreground">{sender.sender_id}</p>
                            {sender.quality_rating && (
                              <p className="text-xs text-muted-foreground">Quality: {sender.quality_rating}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={sender.status === 'active' || sender.status === 'ACTIVE' ? 'default' : 'secondary'}>
                              {sender.status}
                            </Badge>
                            {exists ? (
                              <Badge variant="outline" className="text-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Imported
                              </Badge>
                            ) : (
                              <Button size="sm" onClick={() => handleImportSender('whatsapp', sender)}>
                                <Download className="h-3 w-3 mr-1" />
                                Import
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Viber Senders */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <Smartphone className="h-4 w-4 text-purple-500" />
                  Viber Senders ({infobipSenders.viber.length})
                </h4>
                {infobipSenders.viber.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No Viber senders found</p>
                ) : (
                  <div className="space-y-2">
                    {infobipSenders.viber.map((sender, i) => {
                      const exists = channels.some(c => c.channel_type === 'viber' && c.sender_id === sender.sender_id);
                      return (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{sender.display_name || sender.sender_id}</p>
                            <p className="text-sm text-muted-foreground">{sender.sender_id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={sender.status === 'active' || sender.status === 'ACTIVE' ? 'default' : 'secondary'}>
                              {sender.status}
                            </Badge>
                            {exists ? (
                              <Badge variant="outline" className="text-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Imported
                              </Badge>
                            ) : (
                              <Button size="sm" onClick={() => handleImportSender('viber', sender)}>
                                <Download className="h-3 w-3 mr-1" />
                                Import
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {infobipSenders.sms.length === 0 && infobipSenders.whatsapp.length === 0 && infobipSenders.viber.length === 0 && (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No senders found</h3>
                  <p className="text-sm text-muted-foreground">
                    Your Infobip account doesn't have any SMS, WhatsApp, or Viber senders configured.
                    <br />
                    Please set up senders in the Infobip portal first.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSyncModal(false)}>
                Close
              </Button>
              {(infobipSenders.sms.length > 0 || infobipSenders.whatsapp.length > 0 || infobipSenders.viber.length > 0) && (
                <Button onClick={handleImportAll} disabled={syncing}>
                  <Download className="h-4 w-4 mr-2" />
                  Import All New
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sender_id) {
      toast({
        title: 'Error',
        description: 'Sender ID is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      if (channel) {
        await messagingService.updateChannel(channel.id, formData);
        toast({
          title: 'Success',
          description: 'Channel updated successfully',
        });
      } else {
        await messagingService.createChannel({
          ...formData,
          provider: 'infobip',
          config: {},
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
                <SelectItem value="viber">Viber</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sender ID / Phone Number</Label>
            <Input
              value={formData.sender_id}
              onChange={(e) => setFormData({ ...formData, sender_id: e.target.value })}
              placeholder={formData.channel_type === 'sms' ? 'YourBrand or +1234567890' : '+1234567890'}
            />
            <p className="text-xs text-muted-foreground">
              {formData.channel_type === 'sms'
                ? 'Alphanumeric sender ID or phone number'
                : 'Phone number in E.164 format'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Display Name (Optional)</Label>
            <Input
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="Marketing SMS"
            />
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
