export interface MivaaActor {
  userId: string;
  workspaceId?: string | null;
}

/**
 * Who a tool calls MIVAA as. A session JWT goes through as-is. MIVAA cannot read a kai_ key, so for
 * one the tool sends MIVAA's own service key with X-Acting-User — honoured by MIVAA only alongside
 * that key — after the edge has authenticated the key and debited it. No token: the service key.
 */
export function mivaaAuthHeaders(token: string | undefined, actor?: MivaaActor): Record<string, string> {
  if (token?.startsWith('kai_')) {
    if (!actor?.userId) throw new Error('A kai_ key caller reaches MIVAA only as a named user');
    return {
      Authorization: `Bearer ${Deno.env.get('MIVAA_API_KEY') ?? ''}`,
      'X-Acting-User': actor.userId,
      ...(actor.workspaceId ? { 'X-Workspace-Id': actor.workspaceId } : {}),
    };
  }
  return { Authorization: `Bearer ${token || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}` };
}
