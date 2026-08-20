/**
 * "Deals on this record" — the other half of the contact/company ↔ deal link (#311).
 *
 * A deal carries `contact_id` / `company_id`, but until this card existed the link only worked one
 * way: you could attach a party to a deal and then never see that deal from the party. A one-way
 * link is indistinguishable from no link for anyone working from the record page.
 *
 * Stage labels come from each deal's own type (stages are per type) — resolved in the service, not
 * from a constant here.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Kanban } from 'lucide-react';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { Badge } from '@/components/core/ui/badge';
import { listDealsForParty, type PartyDeal } from '@/services/dealsService';

interface Props {
  workspaceId: string;
  contactId?: string | null;
  companyId?: string | null;
}

export const PartyDealsCard: React.FC<Props> = ({ workspaceId, contactId, companyId }) => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<PartyDeal[] | null>(null);

  useEffect(() => {
    if (!workspaceId || (!contactId && !companyId)) { setDeals([]); return; }
    let cancelled = false;
    listDealsForParty(workspaceId, { contactId, companyId })
      .then((r) => { if (!cancelled) setDeals(r); })
      .catch(() => { if (!cancelled) setDeals([]); });
    return () => { cancelled = true; };
  }, [workspaceId, contactId, companyId]);

  if (deals === null) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  const open = deals.filter((d) => d.status === 'open');
  const closed = deals.filter((d) => d.status !== 'open');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Kanban className="h-3.5 w-3.5" /> Deals
        {deals.length > 0 && <span className="opacity-70">· {open.length} open</span>}
      </div>

      {deals.length === 0 ? (
        <p className="text-xs text-muted-foreground">No deals yet.</p>
      ) : (
        <div className="space-y-1">
          {[...open, ...closed].map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => navigate(`/crm/deals/${d.id}`)}
              className="flex w-full items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-left hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {d.title?.trim() || d.type_label || 'Deal'}
              </span>
              {d.value != null && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatMoney(d.value, d.currency || 'EUR', { decimals: 0, fallback: '' })}
                </span>
              )}
              <Badge className={`shrink-0 border-0 text-[10px] ${d.status === 'won' ? 'bg-emerald-500/15 text-emerald-600' : d.status === 'lost' ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'}`}>
                {d.status === 'open' ? d.stage_label : d.status === 'won' ? 'Won' : 'Lost'}
              </Badge>
              {d.expected_close_date && d.status === 'open' && (
                <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{formatDate(d.expected_close_date)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
