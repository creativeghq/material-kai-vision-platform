import React, { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: number;
  description: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export const SystemSettingsPage: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoteExpirationDays, setQuoteExpirationDays] = useState<number>(30);
  const [settingId, setSettingId] = useState<string>('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('setting_key', 'quote_expiration_days')
        .single();

      if (error) throw error;

      if (data) {
        setQuoteExpirationDays(data.setting_value as number);
        setSettingId(data.id);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load system settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (quoteExpirationDays < 1) {
      toast({
        title: 'Invalid Value',
        description: 'Expiration days must be at least 1',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: quoteExpirationDays,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settingId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'System settings updated successfully',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save system settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="System Settings"
          description="Configure platform-wide settings"
          badge="Admin"
        />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="System Settings"
        description="Configure platform-wide settings"
        badge="Admin"
      />

      {/* Settings Content */}
      <div className="p-6 space-y-6">
          <div className="dashboard-card space-y-6">
            {/* Quote Expiration Setting */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
                <h2 className="text-xl font-semibold">Quote Expiration</h2>
              </div>

              <div className="space-y-4">
                <Label htmlFor="expiration-days" className="text-base">
                  Days Until Expiration
                </Label>
                <p className="text-sm text-muted-foreground">
                  Number of days of inactivity before a draft quote expires.
                  Any activity (adding/removing items) extends the expiration.
                </p>

                <div className="flex items-center gap-4">
                  <Input
                    id="expiration-days"
                    type="number"
                    min="1"
                    value={quoteExpirationDays}
                    onChange={(e) => setQuoteExpirationDays(parseInt(e.target.value) || 1)}
                    className="max-w-xs"
                  />
                  <span className="text-muted-foreground">days</span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={saving}
                style={{ backgroundColor: 'hsl(var(--primary))' }}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
      </div>
    </div>
  );
};

