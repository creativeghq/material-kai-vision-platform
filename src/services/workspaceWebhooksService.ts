import { supabase } from '@/integrations/supabase/client';

/**
 * Outbound tenant webhooks (#330) — client for `workspace-webhooks-api`.
 *
 * Every call goes through the edge function rather than PostgREST, and that is not indirection
 * for its own sake: the signing secret is generated server-side and is column-level revoked
 * from `authenticated`, the endpoint URL is SSRF-checked before it is ever stored, and the
 * event types are validated against the emitted vocabulary. None of those can be done from
 * the browser.
 */

export interface WorkspaceWebhook {
  id: string;
  url: string;
  description: string | null;
  event_types: string[];
  is_active: boolean;
  consecutive_failures: number;
  disabled_reason: string | null;
  last_delivery_at: string | null;
  last_success_at: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  event_type: string;
  status: 'pending' | 'delivering' | 'delivered' | 'failed' | 'dropped';
  attempt: number;
  http_status: number | null;
  error: string | null;
  response_snippet: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-webhooks-api', { body });
  if (error) {
    // The function returns a real status + message via HttpError; surface that rather than the
    // generic "Edge Function returned a non-2xx status code", which tells the user nothing.
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const workspaceWebhooksService = {
  async list(workspaceId: string): Promise<{ webhooks: WorkspaceWebhook[]; available_events: string[] }> {
    return call({ action: 'list', workspace_id: workspaceId });
  },

  /** The returned `secret` is the ONLY time it is ever available — it cannot be read back. */
  async create(input: {
    workspaceId: string; url: string; eventTypes: string[]; description?: string;
  }): Promise<{ webhook: WorkspaceWebhook; secret: string }> {
    return call({
      action: 'create',
      workspace_id: input.workspaceId,
      url: input.url,
      event_types: input.eventTypes,
      description: input.description ?? null,
    });
  },

  async update(id: string, patch: {
    url?: string; eventTypes?: string[]; description?: string | null; isActive?: boolean;
  }): Promise<void> {
    await call({
      action: 'update',
      id,
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.eventTypes !== undefined ? { event_types: patch.eventTypes } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    });
  },

  /** Invalidates the old secret immediately — any receiver still verifying with it will start
   *  rejecting deliveries, so the tenant must deploy the new one. */
  async rotateSecret(id: string): Promise<{ secret: string }> {
    return call({ action: 'rotate_secret', id });
  },

  async remove(id: string): Promise<void> {
    await call({ action: 'delete', id });
  },

  async deliveries(id: string, limit = 25): Promise<{ deliveries: WebhookDelivery[] }> {
    return call({ action: 'deliveries', id, limit });
  },
};
