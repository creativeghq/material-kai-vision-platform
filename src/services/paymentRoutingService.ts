import { supabase } from '@/integrations/supabase/client';

export interface PaymentConfig {
  payout_mode: 'platform' | 'connect';
  stripe_connect_account_id: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
}

export const paymentRoutingService = {
  async getConfig(workspaceId: string): Promise<PaymentConfig | null> {
    const { data } = await supabase
      .from('workspace_payment_config')
      .select('payout_mode, stripe_connect_account_id, charges_enabled, details_submitted')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    return (data as PaymentConfig) ?? null;
  },

  async onboard(workspaceId: string, returnUrl: string): Promise<{ url: string }> {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: { action: 'onboard', workspace_id: workspaceId, return_url: returnUrl },
    });
    if (error) throw error;
    return data as { url: string };
  },

  async refreshStatus(workspaceId: string): Promise<{ configured: boolean; charges_enabled: boolean; details_submitted?: boolean }> {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: { action: 'status', workspace_id: workspaceId },
    });
    if (error) throw error;
    return data as any;
  },
};
