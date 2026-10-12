import { createClient } from '@supabase/supabase-js';
import { VOYAGE_DOCUMENT_MODEL } from '../_shared/embedding-utils.ts';

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

export { VOYAGE_DOCUMENT_MODEL };

/**
 * Embed one stored document through MIVAA (Voyage, 1024D, input_type 'document').
 * MIVAA gates /api/embeddings/* with verify_internal_access; x-cron-secret is the branch that
 * works here, because its JWT check rejects aud="service_role". `workspace_id` is attribution
 * only — without it the spend lands in ai_usage_logs owned by nobody.
 */
export async function embedDocumentText(text: string, workspaceId: string | null): Promise<number[]> {
  const base = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
  const res = await fetch(`${base}/api/embeddings/clip-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': Deno.env.get('CRON_SECRET') || '' },
    body: JSON.stringify({
      text: text.substring(0, 8000),
      model: VOYAGE_DOCUMENT_MODEL,
      input_type: 'document',
      dimensions: 1024,
      workspace_id: workspaceId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MIVAA embedding API ${res.status}: ${body.substring(0, 160)}`);
  }
  const result = await res.json();
  if (!result?.success || !Array.isArray(result.embedding)) {
    throw new Error(`MIVAA embedding failed: ${result?.error ?? 'no embedding returned'}`);
  }
  return result.embedding as number[];
}
