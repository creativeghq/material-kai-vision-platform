/**
 * Messaging Opt-outs Tab
 * Manage phone number opt-outs for compliance
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, UserX, Search, Phone, MessageCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { messagingService, MessagingOptout, MessagingChannelType } from '@/services/messaging';
import { format } from 'date-fns';

const channelIcons: Record<string, React.ReactNode> = {
  sms: <Phone className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4 text-green-500" />,
  all: <UserX className="h-4 w-4 text-red-500" />,
};

const sourceLabels: Record<string, string> = {
  keyword: 'STOP Keyword',
  manual: 'Manual Entry',
  api: 'API Request',
  complaint: 'Complaint',
};

export const MessagingOptoutsTab: React.FC = () => {
  const [optouts, setOptouts] = useState<MessagingOptout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [searchPhone, setSearchPhone] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadOptouts();
  }, [filterChannel]);

  const loadOptouts = async () => {
    try {
      setLoading(true);
      const data = await messagingService.getOptOuts(
        filterChannel !== 'all' ? filterChannel as MessagingChannelType | 'all' : undefined
      );
      setOptouts(data);
    } catch (error) {
      console.error('Error loading opt-outs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load opt-out list',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOptout = async (optout: MessagingOptout) => {
    if (!confirm(`Are you sure you want to remove ${optout.phone_number} from the opt-out list?`)) return;

    try {
      await messagingService.removeOptOut(optout.phone_number, optout.channel_type);
      toast({
        title: 'Success',
        description: 'Opt-out removed successfully',
      });
      loadOptouts();
    } catch (error) {
      console.error('Error removing opt-out:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove opt-out',
        variant: 'destructive',
      });
    }
  };

  const filteredOptouts = searchPhone
    ? optouts.filter(o => o.phone_number.includes(searchPhone))
    : optouts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Opt-out List</h3>
            <p className="text-sm text-muted-foreground">
              Manage phone numbers that have opted out of messaging
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Opt-out
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="dashboard-card">
        <div className="flex flex-wrap gap-4">
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                placeholder="Search by phone number..."
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="dashboard-card">
          <div className="text-sm text-muted-foreground">Total Opt-outs</div>
          <div className="text-2xl font-bold">{optouts.length}</div>
        </div>
        <div className="dashboard-card">
          <div className="text-sm text-muted-foreground">SMS Opt-outs</div>
          <div className="text-2xl font-bold">
            {optouts.filter(o => o.channel_type === 'sms').length}
          </div>
        </div>
        <div className="dashboard-card">
          <div className="text-sm text-muted-foreground">WhatsApp Opt-outs</div>
          <div className="text-2xl font-bold">
            {optouts.filter(o => o.channel_type === 'whatsapp').length}
          </div>
        </div>
      </div>

      {/* Opt-outs List */}
      <div className="dashboard-card">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading opt-outs...
          </div>
        ) : filteredOptouts.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {searchPhone ? 'No opt-outs found matching your search' : 'No opt-outs recorded'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Phone Number</th>
                  <th className="text-left py-3 px-4 font-medium">Channel</th>
                  <th className="text-left py-3 px-4 font-medium">Source</th>
                  <th className="text-left py-3 px-4 font-medium">Reason</th>
                  <th className="text-left py-3 px-4 font-medium">Date</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOptouts.map((optout) => (
                  <tr key={optout.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <span className="font-mono">{optout.phone_number}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {channelIcons[optout.channel_type]}
                        <span className="capitalize">{optout.channel_type}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline">
                        {sourceLabels[optout.source] || optout.source}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">
                        {optout.reason || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(optout.opted_out_at), 'MMM d, yyyy HH:mm')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveOptout(optout)}
                          title="Remove from opt-out list"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Opt-out Modal */}
      {showAddModal && (
        <AddOptoutModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadOptouts();
          }}
        />
      )}
    </div>
  );
};

// Add Opt-out Modal
interface AddOptoutModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AddOptoutModal: React.FC<AddOptoutModalProps> = ({ onClose, onSuccess }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [channelType, setChannelType] = useState<MessagingChannelType | 'all'>('all');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber) {
      toast({
        title: 'Error',
        description: 'Phone number is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      await messagingService.addOptOut(phoneNumber, channelType, reason, 'manual');
      toast({
        title: 'Success',
        description: 'Opt-out added successfully',
      });
      onSuccess();
    } catch (error) {
      console.error('Error adding opt-out:', error);
      toast({
        title: 'Error',
        description: 'Failed to add opt-out',
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
          <DialogTitle>Add Opt-out</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
            />
            <p className="text-xs text-muted-foreground">
              Enter in E.164 format (e.g., +1234567890)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <Select
              value={channelType}
              onValueChange={(value) => setChannelType(value as MessagingChannelType | 'all')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="sms">SMS Only</SelectItem>
                <SelectItem value="whatsapp">WhatsApp Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason (Optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="User requested removal"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Add Opt-out'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default MessagingOptoutsTab;
