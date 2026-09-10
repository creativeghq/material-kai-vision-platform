/**
 * Pinterest Integration Service
 *
 * Handles Pinterest pin imports and OAuth for moodboard integration.
 * Phase 1: URL-based import via oEmbed (no OAuth required)
 * Phase 2: Full OAuth board browsing and bulk import
 */

import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────

export interface PinterestPin {
  title: string;
  image_url: string;
  author?: string;
  source_url: string;
}


export interface PinterestImportResult {
  success: boolean;
  moodboard_item_id?: string;
  image_url?: string;
  matches?: Array<{
    product_id: string;
    product_name: string;
    similarity: number;
    image_url?: string;
  }>;
  error?: string;
}


// ── Edge function caller ──────────────────────────────────────

async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw new Error(error.message || 'Edge function call failed');
  if (!data?.success) throw new Error(data?.error || 'Operation failed');
  return data as T;
}

// ── Phase 1: URL-based import (no OAuth) ──────────────────────

/**
 * Extract pin metadata from a Pinterest URL via oEmbed
 */
export async function extractPin(pinUrl: string): Promise<PinterestPin> {
  const data = await callEdgeFunction<{ success: boolean; pin: PinterestPin }>(
    'pinterest-api',
    { action: 'extract_pin', pin_url: pinUrl },
  );
  return data.pin;
}

/**
 * Import a single Pinterest pin URL into a moodboard
 */
export async function importPin(
  pinUrl: string,
  moodboardId: string,
  autoMatch = true,
): Promise<PinterestImportResult> {
  return callEdgeFunction<PinterestImportResult>(
    'pinterest-api',
    { action: 'import_pin', pin_url: pinUrl, moodboard_id: moodboardId, auto_match: autoMatch },
  );
}

/**
 * Import multiple Pinterest pin URLs into a moodboard
 */
export async function importPinsBulk(
  pinUrls: string[],
  moodboardId: string,
  autoMatch = true,
): Promise<{ success: boolean; imported: number; failed: number; results: PinterestImportResult[] }> {
  return callEdgeFunction(
    'pinterest-api',
    { action: 'import_pins_bulk', pin_urls: pinUrls, moodboard_id: moodboardId, auto_match: autoMatch },
  );
}

// ── Pinterest account CONNECTION lives with Zernio, not here ──────────────

export const pinterestService = {
  extractPin,
  importPin,
  importPinsBulk,
};
