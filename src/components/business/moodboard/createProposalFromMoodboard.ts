// Single source of truth for "generate a quote from a moodboard", shared by the detail page and
// the list-page card so the two surfaces can't drift (they did: the list page dropped the project,
// the client and every non-catalog item, producing orphaned + duplicate quotes).
// Re-fetches the board's full items (getMoodBoardItems carries media_url/media_title for non-catalog
// items, which the list-page's cached items don't), resolves the owning project's client, links the
// quote back via moodboard_id, and adds EVERY item (catalog → product line, media → custom line).
import { supabase } from '@/integrations/supabase/client';
import { moodboardAPI } from '@/services/moodboardAPI';
import { quotesService } from '@/modules/quotes/services/QuotesService';

export async function createProposalFromMoodboard(
  moodboardId: string,
  title: string,
): Promise<{ quoteId: string; itemCount: number }> {
  const items = await moodboardAPI.getMoodBoardItems(moodboardId);
  if (!items || items.length === 0) throw new Error('Cannot create a proposal from an empty moodboard');

  // Carry the board's project + its client so the quote is billable and shows up in the project's
  // Quotes/Billing/Finance tabs instead of being an orphaned, customer-less quote.
  let projectId: string | null = null;
  let customerCompanyId: string | null = null;
  let customerContactId: string | null = null;
  try {
    const { data: mb } = await supabase.from('moodboards').select('project_id').eq('id', moodboardId).single();
    projectId = (mb as any)?.project_id ?? null;
    if (projectId) {
      const { data: proj } = await supabase.from('projects').select('client_company_id, client_contact_id').eq('id', projectId).single();
      customerCompanyId = (proj as any)?.client_company_id ?? null;
      customerContactId = (proj as any)?.client_contact_id ?? null;
    }
  } catch { /* non-fatal — quote still created, just without the links */ }

  const quote = await quotesService.createQuote({
    name: `Proposal from ${title}`,
    notes: `Created from moodboard: ${title}`,
    project_id: projectId,
    customer_company_id: customerCompanyId,
    customer_contact_id: customerContactId,
    moodboard_id: moodboardId,
  });

  for (const item of items as Array<{ material_id?: string | null; notes?: string | null; media_title?: string | null; media_url?: string | null }>) {
    if (item.material_id) {
      await quotesService.addItem({
        quote_id: quote.id, product_id: item.material_id, quantity: 1,
        notes: item.notes || '', added_from: 'moodboard',
      });
    } else {
      await quotesService.addCustomItem({
        quote_id: quote.id,
        custom_product_name: item.media_title || 'Inspiration item',
        custom_image_url: item.media_url || undefined,
        quantity: 1, notes: item.notes || '',
      });
    }
  }

  return { quoteId: quote.id, itemCount: items.length };
}
