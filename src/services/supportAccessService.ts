import { supabase } from '@/integrations/supabase/client';

export const SUPPORT_ACCESS_DURATIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 480, label: '8 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 4320, label: '3 days' },
  { minutes: 10080, label: '7 days' },
] as const;

export const SUPPORT_PIN_VALIDITIES = [
  { minutes: 10, label: '10 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '1 day' },
] as const;

export const DEFAULT_SUPPORT_ACCESS_MINUTES = 240;
export const DEFAULT_SUPPORT_PIN_MINUTES = 30;

export type AccessRequestStatus = 'pending' | 'approved' | 'redeemed' | 'denied' | 'expired' | 'locked';

export interface MySupportAccess {
  workspace_id: string;
  workspace_name: string;
  active: boolean;
  seconds_left: number;
  request: {
    status: AccessRequestStatus;
    requested_at: string;
    pin_seconds_left: number | null;
    attempts_left: number;
  } | null;
}

export interface WorkspaceSupportMember {
  user_id: string;
  active: boolean;
  seconds_left: number;
  request: {
    id: string;
    status: 'pending' | 'approved';
    requested_at: string;
    pin_seconds_left: number | null;
  } | null;
}

export type RedeemPinResult =
  | { ok: true; seconds_left: number }
  | { ok: false; error: 'format' | 'no_pin' | 'expired' | 'locked' | 'wrong_pin'; attempts_left?: number };

export type RequestAccessResult =
  | { ok: true; already_open?: boolean; notified?: number }
  | { ok: false; error: 'not_found' | 'still_active' | 'too_many' };

export type IssuePinResult =
  | { ok: true; pin: string; pin_expires_at: string; pin_seconds: number }
  | { ok: false; error: 'not_found' | 'closed' };

/** These RPCs are not in the generated types yet. */
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: Error | null }>;
  };
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const supportAccessService = {
  mine: () => call<MySupportAccess[]>('get_my_support_access'),
  requestAccess: (workspaceId: string) =>
    call<RequestAccessResult>('request_workspace_access', { p_workspace_id: workspaceId }),
  redeemPin: (workspaceId: string, pin: string) =>
    call<RedeemPinResult>('redeem_workspace_access_pin', { p_workspace_id: workspaceId, p_pin: pin }),
  list: (workspaceId: string) =>
    call<WorkspaceSupportMember[]>('list_workspace_support_access', { p_workspace_id: workspaceId }),
  approve: (requestId: string, accessMinutes: number, pinMinutes: number) =>
    call<IssuePinResult>('approve_workspace_access_request', {
      p_request_id: requestId, p_access_minutes: accessMinutes, p_pin_minutes: pinMinutes,
    }),
  deny: (requestId: string) => call<boolean>('deny_workspace_access_request', { p_request_id: requestId }),
  end: (workspaceId: string, userId: string) =>
    call<boolean>('end_workspace_support_access', { p_workspace_id: workspaceId, p_user_id: userId }),
};

export function formatTimeLeft(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
