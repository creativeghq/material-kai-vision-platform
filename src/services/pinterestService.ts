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

export interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  pin_count: number;
  image_url?: string;
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

export interface PinterestConnection {
  connected: boolean;
  username?: string;
  connected_at?: string;
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
    'pinterest-import',
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
    'pinterest-import',
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
    'pinterest-import',
    { action: 'import_pins_bulk', pin_urls: pinUrls, moodboard_id: moodboardId, auto_match: autoMatch },
  );
}

// ── Phase 2: OAuth board browsing ─────────────────────────────

/**
 * Get the Pinterest OAuth authorization URL
 */
export async function getAuthUrl(): Promise<string> {
  const data = await callEdgeFunction<{ success: boolean; auth_url: string }>(
    'pinterest-oauth',
    { action: 'get_auth_url' },
  );
  return data.auth_url;
}

/**
 * Complete OAuth callback with authorization code
 */
export async function completeOAuth(code: string, state: string): Promise<void> {
  await callEdgeFunction('pinterest-oauth', { action: 'callback', code, state });
}

/**
 * Check if user has a connected Pinterest account
 */
export async function getConnectionStatus(): Promise<PinterestConnection> {
  const { data } = await supabase
    .from('social_accounts')
    .select('account_name, created_at')
    .eq('platform', 'pinterest')
    .maybeSingle();

  return {
    connected: !!data,
    username: data?.account_name ?? undefined,
    connected_at: data?.created_at ?? undefined,
  };
}

/**
 * Get user's Pinterest boards (requires OAuth)
 */
export async function getBoards(): Promise<PinterestBoard[]> {
  const data = await callEdgeFunction<{ success: boolean; boards: PinterestBoard[] }>(
    'pinterest-oauth',
    { action: 'get_boards' },
  );
  return data.boards;
}

/**
 * Get pins from a Pinterest board (requires OAuth)
 */
export async function getBoardPins(
  boardId: string,
  bookmark?: string,
): Promise<{ pins: PinterestPin[]; bookmark?: string }> {
  const data = await callEdgeFunction<{ success: boolean; pins: PinterestPin[]; bookmark?: string }>(
    'pinterest-oauth',
    { action: 'get_board_pins', board_id: boardId, bookmark },
  );
  return { pins: data.pins, bookmark: data.bookmark };
}

/**
 * Disconnect Pinterest account
 */
export async function disconnect(): Promise<void> {
  await callEdgeFunction('pinterest-oauth', { action: 'disconnect' });
}

export const pinterestService = {
  extractPin,
  importPin,
  importPinsBulk,
  getAuthUrl,
  completeOAuth,
  getConnectionStatus,
  getBoards,
  getBoardPins,
  disconnect,
};
