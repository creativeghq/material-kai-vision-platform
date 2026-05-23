import { supabase } from '@/integrations/supabase/client';

export interface PlatformSecretView {
  key: string;
  value_masked: string | null;
  value_present: boolean;
  description: string | null;
  category: string | null;
  primary_module_slug: string | null;
  is_sensitive: boolean;
  default_value: string | null;
  last_verified_at: string | null;
  last_verified_status: 'ok' | 'failed' | null;
  last_verified_error: string | null;
  updated_at: string | null;
  effective: {
    value_present: boolean;
    source: 'env' | 'db' | 'default' | 'missing';
  };
  modules: string[];
}

export interface OxygenTaxRow {
  id: number;
  name?: string;
  rate?: number;
  code?: string;
  [k: string]: unknown;
}

export interface OxygenWarehouseRow {
  id: number;
  name?: string;
  code?: string;
  [k: string]: unknown;
}

class PlatformSecretsService {
  async list(): Promise<PlatformSecretView[]> {
    const { secrets } = await this.invoke<{ secrets: PlatformSecretView[] }>({ action: 'list' });
    return secrets ?? [];
  }

  async listPlatform(): Promise<PlatformSecretView[]> {
    const { secrets } = await this.invoke<{ secrets: PlatformSecretView[] }>({ action: 'list_platform' });
    return secrets ?? [];
  }

  async listForModule(moduleSlug: string): Promise<PlatformSecretView[]> {
    const { secrets } = await this.invoke<{ secrets: PlatformSecretView[] }>({
      action: 'list_for_module',
      module_slug: moduleSlug,
    });
    return secrets ?? [];
  }

  async save(key: string, value: string | null): Promise<PlatformSecretView[]> {
    const { secrets } = await this.invoke<{ secrets: PlatformSecretView[] }>({
      action: 'save',
      key,
      value,
    });
    return secrets ?? [];
  }

  async saveMany(entries: Array<{ key: string; value: string | null }>, moduleSlug?: string): Promise<PlatformSecretView[]> {
    const { secrets } = await this.invoke<{ secrets: PlatformSecretView[] }>({
      action: 'save_many',
      entries,
      module_slug: moduleSlug,
    });
    return secrets ?? [];
  }

  async clearValue(key: string): Promise<PlatformSecretView[]> {
    const { secrets } = await this.invoke<{ secrets: PlatformSecretView[] }>({
      action: 'delete_value',
      key,
    });
    return secrets ?? [];
  }

  // ── Oxygen test/lookup helpers (per-family) ─────────────────────
  async testOxygen(overrideValue?: string): Promise<{ taxes_count: number; base_url: string }> {
    return await this.invoke({ action: 'test_oxygen', override_value: overrideValue });
  }

  async listOxygenTaxes(overrideValue?: string): Promise<OxygenTaxRow[]> {
    const { taxes } = await this.invoke<{ taxes: OxygenTaxRow[] }>({
      action: 'list_oxygen_taxes',
      override_value: overrideValue,
    });
    return taxes ?? [];
  }

  async listOxygenWarehouses(overrideValue?: string): Promise<OxygenWarehouseRow[]> {
    const { warehouses } = await this.invoke<{ warehouses: OxygenWarehouseRow[] }>({
      action: 'list_oxygen_warehouses',
      override_value: overrideValue,
    });
    return warehouses ?? [];
  }

  private async invoke<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('platform-secrets-admin', { body });
    if (error) {
      const msg = (data as { error?: string } | null)?.error ?? error.message;
      throw new Error(msg);
    }
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as T;
  }
}

export const platformSecretsService = new PlatformSecretsService();
