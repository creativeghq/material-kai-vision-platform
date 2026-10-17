import { supabase } from '@/integrations/supabase/client';

export type ProductLifecycleStatus = 'draft' | 'active';

export const PRODUCT_STATUS_BADGE: Record<string, { label: string; variant: 'warning' | 'success' | 'neutral' }> = {
  draft: { label: 'Draft', variant: 'warning' },
  active: { label: 'Active', variant: 'success' },
};

export function productStatusBadge(status: string | null | undefined): { label: string; variant: 'warning' | 'success' | 'neutral' } {
  if (!status) return { label: 'Unknown', variant: 'neutral' };
  return PRODUCT_STATUS_BADGE[status] ?? { label: status, variant: 'neutral' };
}

export async function publishProducts(productIds: string[]): Promise<number> {
  if (productIds.length === 0) return 0;
  const { data, error } = await supabase.rpc('publish_products' as never, { p_product_ids: productIds } as never);
  if (error) throw new Error(error.message);
  const count = Number(data);
  if (!Number.isFinite(count)) throw new Error('publish_products returned no count');
  return count;
}

const PAGE = 1000;

export async function publishCatalogue(workspaceId: string, sourceDocumentId: string): Promise<{ requested: number; published: number }> {
  const ids: string[] = [];
  let after: string | null = null;
  for (;;) {
    let q = supabase
      .from('products')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('source_document_id', sourceDocumentId)
      .eq('status', 'draft')
      .order('id', { ascending: true })
      .limit(PAGE);
    if (after) q = q.gt('id', after);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const page = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    ids.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1];
  }
  let published = 0;
  for (let i = 0; i < ids.length; i += PAGE) {
    try {
      published += await publishProducts(ids.slice(i, i + PAGE));
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(`${published} of ${ids.length} draft(s) were published before this failed: ${why}`);
    }
  }
  return { requested: ids.length, published };
}
