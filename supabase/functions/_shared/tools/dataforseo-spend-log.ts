/** Cost-log row for DataForSEO calls an edge function makes itself rather than through MIVAA. */

// deno-lint-ignore no-explicit-any
type Sb = any;

export const DATAFORSEO_DIRECT_MODEL = 'dataforseo-direct';

/** Books the provider-reported cost in `ai_usage_logs`; `ops.provider_spend_unreconciled` counts these rows. Never throws. */
export async function logDataForSeoDirectSpend(
  sb: Sb,
  row: { userId?: string | null; workspaceId?: string | null; operation: string; costUsd: number; ok: boolean; note?: string },
): Promise<void> {
  try {
    const { error } = await sb.from('ai_usage_logs').insert({
      user_id: row.userId ?? null,
      workspace_id: row.workspaceId ?? null,
      operation_type: `${row.operation}.dataforseo`,
      model_name: DATAFORSEO_DIRECT_MODEL,
      raw_cost_usd: row.costUsd,
      billed_cost_usd: row.costUsd,
      module_slug: 'seo-toolkit',
      api_provider: 'dataforseo',
      metadata: { success: row.ok, cost_source: 'provider', ...(row.note ? { note: row.note } : {}) },
    });
    if (error) console.warn('[dataforseo-spend-log] insert failed:', error.message);
  } catch (e) {
    console.warn('[dataforseo-spend-log] insert threw:', (e as Error).message);
  }
}
