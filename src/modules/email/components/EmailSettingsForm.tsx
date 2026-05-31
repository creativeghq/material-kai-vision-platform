/**
 * Email Settings Form — the inner form used by both:
 *  - EmailSettingsModal (Dialog wrapper, legacy entrance point)
 *  - EmailSettingsPanel (mounted on `/admin/modules/email/settings` via settingsPanels)
 *
 * Reads/writes `email_settings.{default_from_email, default_from_name}`.
 * Caller controls layout (dialog vs panel) and the Save / Cancel button placement
 * by rendering its own footer using the form's `onSave` + `saving` props.
 */
import React, { useEffect, useImperativeHandle, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface EmailSettingsValue {
  default_from_email: string;
  default_from_name: string;
}

export interface EmailSettingsFormHandle {
  save: () => Promise<boolean>;
  isSaving: boolean;
  isLoading: boolean;
}

interface Props {
  /** Optional: called after a successful save (e.g. modal closes itself). */
  onSaved?: () => void;
  /** Optional: render a footer slot below the fields. The caller passes a function
   *  that returns its own buttons; the form passes back `{ save, saving, loading }`
   *  so the buttons can be wired up. */
  renderFooter?: (ctx: { save: () => Promise<boolean>; saving: boolean; loading: boolean }) => React.ReactNode;
}

export const EmailSettingsForm = React.forwardRef<EmailSettingsFormHandle, Props>(
  ({ onSaved, renderFooter }, ref) => {
    const [settings, setSettings] = useState<EmailSettingsValue>({
      default_from_email: '',
      default_from_name: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => { void load(); }, []);

    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('email_settings')
          .select('setting_key, setting_value')
          .in('setting_key', ['default_from_email', 'default_from_name']);
        if (error) throw error;

        const map: EmailSettingsValue = { default_from_email: '', default_from_name: '' };
        data?.forEach((it: any) => {
          if (it.setting_key === 'default_from_email') map.default_from_email = it.setting_value;
          if (it.setting_key === 'default_from_name') map.default_from_name = it.setting_value;
        });
        setSettings(map);
      } catch (err) {
        toast({ title: 'Error', description: 'Failed to load email settings', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    const save = async (): Promise<boolean> => {
      try {
        setSaving(true);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(settings.default_from_email)) {
          toast({ title: 'Invalid Email', description: 'Please enter a valid email address', variant: 'destructive' });
          return false;
        }
        if (!settings.default_from_name.trim()) {
          toast({ title: 'Invalid Name', description: 'Sender name cannot be empty', variant: 'destructive' });
          return false;
        }
        const updates = [
          { setting_key: 'default_from_email', setting_value: settings.default_from_email },
          { setting_key: 'default_from_name', setting_value: settings.default_from_name },
        ];
        for (const u of updates) {
          const { error } = await supabase
            .from('email_settings')
            .update({ setting_value: u.setting_value })
            .eq('setting_key', u.setting_key);
          if (error) throw error;
        }
        toast({ title: 'Settings Saved', description: 'Email settings have been updated successfully' });
        onSaved?.();
        return true;
      } catch (err) {
        toast({ title: 'Error', description: 'Failed to save email settings', variant: 'destructive' });
        return false;
      } finally {
        setSaving(false);
      }
    };

    useImperativeHandle(ref, () => ({ save, isSaving: saving, isLoading: loading }), [saving, loading]);

    if (loading) {
      return (
        <div className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading settings...
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="from_email">Default Sender Email</Label>
          <Input
            id="from_email"
            type="email"
            placeholder="noreply@yourdomain.com"
            value={settings.default_from_email}
            onChange={e => setSettings({ ...settings, default_from_email: e.target.value })}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            This email address will be used as the default sender for all outgoing emails.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="from_name">Default Sender Name</Label>
          <Input
            id="from_name"
            type="text"
            placeholder="Materials Hub"
            value={settings.default_from_name}
            onChange={e => setSettings({ ...settings, default_from_name: e.target.value })}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            This name will appear as the sender name in email clients.
          </p>
        </div>

        {renderFooter?.({ save, saving, loading })}
      </div>
    );
  },
);

EmailSettingsForm.displayName = 'EmailSettingsForm';
