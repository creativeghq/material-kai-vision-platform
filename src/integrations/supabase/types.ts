/**
 * Supabase shared types.
 *
 * The Supabase client itself is loosely typed (cast to `any` in client.ts), so
 * there is no generated Database schema in this project. This file holds the
 * shared utility types that consumers import alongside the client.
 */

/** Canonical recursive JSON type — matches what Supabase generates by default. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
