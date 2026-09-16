import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';


export interface OwnerProperty {
  id: string;
  title: string | null;
  address: string | null;
  town: string | null;
  listing_status: string | null;
  transaction_type: string | null;
  price: number | null;
  currency: string | null;
  bedrooms: number | null;
  area_built: number | null;
  cover_path?: string | null;
}

export interface OwnerViewing {
  scheduled_at: string;
  status: string;
  feedback: string | null;
}

export interface OwnerOfferSummary {
  total: number;
  live: number;
  highest: number | null;
  currency: string;
  leading_status: string | null;
  latest_at: string | null;
}

export interface OwnerManagement {
  tenancy: Record<string, any>;
  rent: { charged: number; received: number; outstanding: number; currency: string };
  charges: Array<{ id: string; due_date: string; amount: number; currency: string; settled: number; outstanding: number; payment_status: string }>;
  maintenance: Array<{ id: string; title: string; status: string; priority: string | null; reported_at: string | null; resolved_at: string | null }>;
  inspections: Array<{ id: string; scheduled_at: string | null; status: string }>;
}

export interface OwnerPropertyDetail {
  property: OwnerProperty & Record<string, any>;
  performance: { days_on_market?: number | null; views?: number | null } | null;
  enquiries: number;
  viewings: OwnerViewing[];
  offers: OwnerOfferSummary;
  price_history: Array<{ price: number; currency: string; changed_at: string }>;
  management: OwnerManagement | null;
  management_available: boolean;
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('real-estate-owner', {
    body: { ...extra, action },
  });
  if (error) throw await edgeError(error);
  return data as T;
}

export const ownerPropertiesService = {
  list: () => call<{ properties: OwnerProperty[] }>('list'),
  get: (propertyId: string) => call<OwnerPropertyDetail>('get', { property_id: propertyId }),
};
