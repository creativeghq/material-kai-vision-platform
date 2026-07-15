import { usersAPI, contactsAPI, companiesAPI } from '@/services/crm.service';
import { quotesService } from '@/modules/quotes/services/QuotesService';
import { moodboardAPI } from '@/services/moodboardAPI';
import { agentChatHistoryService } from '@/services/agents/agentChatHistoryService';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────
export type EntityType =
  | 'user'
  | 'product'
  | 'contact'
  | 'company'
  | 'edge_function'
  | 'moodboard'
  | 'quote'
  | 'conversation';

export interface EntityResult {
  id: string;
  label: string;
  sublabel?: string;
}

// ─── Static edge functions list ──────────────────────────
const EDGE_FUNCTIONS: EntityResult[] = [
  { id: 'agent-chat', label: 'agent-chat', sublabel: 'AI agent conversation handler' },
  { id: 'ai-pricing-updater', label: 'ai-pricing-updater', sublabel: 'AI-driven price updates' },
  { id: 'campaign-processor', label: 'campaign-processor', sublabel: 'Process messaging campaigns' },
  { id: 'email-api', label: 'email-api', sublabel: 'Send transactional emails' },
  { id: 'flow-engine', label: 'flow-engine', sublabel: 'Execute automation flows' },
  { id: 'generate-quote-pdf', label: 'generate-quote-pdf', sublabel: 'Generate quote PDFs' },
  { id: 'generate-vr-world', label: 'generate-vr-world', sublabel: 'Generate 3D VR worlds' },
  { id: 'messaging-api', label: 'messaging-api', sublabel: 'Multi-channel messaging' },
  { id: 'messaging-processor', label: 'messaging-processor', sublabel: 'Process message queue' },
  { id: 'mivaa-gateway', label: 'mivaa-gateway', sublabel: 'MIVAA embedding gateway' },
  { id: 'notification-dispatcher', label: 'notification-dispatcher', sublabel: 'Push notification delivery' },
  { id: 'pdf-batch-process', label: 'pdf-batch-process', sublabel: 'Batch PDF extraction' },
  { id: 'quotes-api', label: 'quotes-api', sublabel: 'Quotes CRUD operations' },
  { id: 'recommendations-api', label: 'recommendations-api', sublabel: 'Product recommendations' },
  { id: 'stripe-api', label: 'stripe-api', sublabel: 'Stripe checkout / customer portal' },
  { id: 'xml-import-orchestrator', label: 'xml-import-orchestrator', sublabel: 'XML catalog import' },
];

// ─── Search dispatcher ───────────────────────────────────
export async function searchEntities(
  entityType: EntityType,
  query: string,
): Promise<EntityResult[]> {
  const q = query.trim().toLowerCase();

  switch (entityType) {
    case 'user': {
      const res = await usersAPI.listUsers(20, 0, q);
      return (res.data || []).map((u: any) => ({
        id: u.id,
        label: u.email || u.id,
        sublabel: u.user_profiles?.full_name || undefined,
      }));
    }

    case 'product': {
      const products = await quotesService.searchProductsWithImages(q, 15);
      return products.map((p) => ({
        id: p.id,
        label: p.name || p.id,
        sublabel: p.sku || undefined,
      }));
    }

    case 'contact': {
      const res = await contactsAPI.listContacts(20, 0);
      // Client-side filter since listContacts doesn't accept search param
      return (res.data || [])
        .filter((c: any) => {
          const name = (c.first_name || '') + ' ' + (c.last_name || '');
          return name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
        })
        .slice(0, 20)
        .map((c: any) => ({
          id: c.id,
          label: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id,
          sublabel: c.email || undefined,
        }));
    }

    case 'company': {
      const res = await companiesAPI.listCompanies(20, 0, q);
      return (res.data || []).map((c: any) => ({
        id: c.id,
        label: c.name || c.id,
        sublabel: c.industry || undefined,
      }));
    }

    case 'edge_function': {
      return EDGE_FUNCTIONS.filter(
        (ef) => ef.id.includes(q) || (ef.sublabel || '').toLowerCase().includes(q),
      );
    }

    case 'moodboard': {
      const boards = await moodboardAPI.getUserMoodBoards();
      return boards
        .filter((b) => b.title.toLowerCase().includes(q))
        .slice(0, 20)
        .map((b) => ({
          id: b.id,
          label: b.title,
          sublabel: b.description || undefined,
        }));
    }

    case 'quote': {
      const { data } = await supabase
        .from('quotes')
        .select('id, name, status, created_at')
        .or(`name.ilike.%${q}%,status.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []).map((r: any) => ({
        id: r.id,
        label: r.name || `Quote ${r.id.slice(0, 8)}`,
        sublabel: r.status || undefined,
      }));
    }

    case 'conversation': {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const convos = await agentChatHistoryService.getUserConversations(user.id);
      return convos
        .filter((c) => (c.title || '').toLowerCase().includes(q))
        .slice(0, 20)
        .map((c) => ({
          id: c.id,
          label: c.title || `Chat ${c.id.slice(0, 8)}`,
          sublabel: c.agentId ? `Agent: ${c.agentId}` : undefined,
        }));
    }

    default:
      return [];
  }
}

// ─── Resolve label for a known entity ID ─────────────────
export async function resolveEntityLabel(
  entityType: EntityType,
  id: string,
): Promise<string | null> {
  if (!id) return null;

  try {
    switch (entityType) {
      case 'user': {
        const res = await usersAPI.getUser(id);
        return res.data?.email || id;
      }
      case 'product': {
        const { data } = await supabase
          .from('products')
          .select('name, sku')
          .eq('id', id)
          .single();
        return data?.name || data?.sku || id;
      }
      case 'contact': {
        const res = await contactsAPI.getContact(id);
        const c = res.data;
        return [c?.first_name, c?.last_name].filter(Boolean).join(' ') || id;
      }
      case 'company': {
        const res = await companiesAPI.getCompany(id);
        return res.data?.name || id;
      }
      case 'edge_function': {
        return EDGE_FUNCTIONS.find((ef) => ef.id === id)?.label || id;
      }
      case 'moodboard': {
        const { data } = await supabase
          .from('moodboards')
          .select('title')
          .eq('id', id)
          .single();
        return data?.title || id;
      }
      case 'quote': {
        const { data } = await supabase
          .from('quotes')
          .select('name')
          .eq('id', id)
          .single();
        return data?.name || id;
      }
      case 'conversation': {
        const { data } = await supabase
          .from('agent_chat_conversations')
          .select('title')
          .eq('id', id)
          .single();
        return data?.title || id;
      }
      default:
        return id;
    }
  } catch {
    return id;
  }
}
