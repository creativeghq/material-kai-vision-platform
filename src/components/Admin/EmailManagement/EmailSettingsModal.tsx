/**
 * Email Settings Modal
 * Configure default email sender settings
 */

import React, { useState, useEffect } from 'react';
import { Settings, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface EmailSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EmailSettings {
  default_from_email: string;
  default_from_name: string;
}

export const EmailSettingsModal: React.FC<EmailSettingsModalProps> = ({
  open,
  onOpenChange,
}) => {
  const [settings, setSettings] = useState<EmailSettings>({
    default_from_email: '',
    default_from_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['default_from_email', 'default_from_name']);

      if (error) throw error;

      const settingsMap: EmailSettings = {
        default_from_email: '',
        default_from_name: '',
      };

      data?.forEach((item) => {
        if (item.setting_key === 'default_from_email') {
          settingsMap.default_from_email = item.setting_value;
        } else if (item.setting_key === 'default_from_name') {
          settingsMap.default_from_name = item.setting_value;
        }
      });

      setSettings(settingsMap);
    } catch (error) {
      console.error('Error loading email settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(settings.default_from_email)) {
        toast({
          title: 'Invalid Email',
          description: 'Please enter a valid email address',
          variant: 'destructive',
        });
        return;
      }

      // Validate name is not empty
      if (!settings.default_from_name.trim()) {
        toast({
          title: 'Invalid Name',
          description: 'Sender name cannot be empty',
          variant: 'destructive',
        });
        return;
      }

      // Update both settings
      const updates = [
        {
          setting_key: 'default_from_email',
          setting_value: settings.default_from_email,
        },
        {
          setting_key: 'default_from_name',
          setting_value: settings.default_from_name,
        },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('email_settings')
          .update({ setting_value: update.setting_value })
          .eq('setting_key', update.setting_key);

        if (error) throw error;
      }

      toast({
        title: 'Settings Saved',
        description: 'Email settings have been updated successfully',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving email settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save email settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Email Settings
          </DialogTitle>
          <DialogDescription>
            Configure default sender information for outgoing emails
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading settings...
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="from_email">Default Sender Email</Label>
              <Input
                id="from_email"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={settings.default_from_email}
                onChange={(e) =>
                  setSettings({ ...settings, default_from_email: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                This email address will be used as the default sender for all outgoing emails
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from_name">Default Sender Name</Label>
              <Input
                id="from_name"
                type="text"
                placeholder="Material Kai"
                value={settings.default_from_name}
                onChange={(e) =>
                  setSettings({ ...settings, default_from_name: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                This name will appear as the sender name in email clients
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailSettingsModal;

