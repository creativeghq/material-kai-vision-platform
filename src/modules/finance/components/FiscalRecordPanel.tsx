/** What AADE holds for a transmitted document, and the two places to see it online. Props only — safe on a public page. */
import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubPanel, HubProperty, HubPropertyList } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';

export interface FiscalRecord {
  fiscal_status: string | null;
  fiscal_mark: string | null;
  fiscal_uid?: string | null;
  fiscal_submitted_at?: string | null;
  fiscal_qr_url?: string | null;
  fiscal_aade_qr_url?: string | null;
  fiscal_error?: string | null;
  fiscal_cancellation_mark?: string | null;
}

export function fiscalLinks(r: FiscalRecord): { label: string; href: string }[] {
  return [
    r.fiscal_aade_qr_url ? { label: 'Verify on AADE', href: r.fiscal_aade_qr_url } : null,
    r.fiscal_qr_url ? { label: 'View online (provider copy)', href: r.fiscal_qr_url } : null,
  ].filter(Boolean) as { label: string; href: string }[];
}

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  accepted: 'success', offline: 'info', pending: 'warning', rejected: 'error', error: 'error', failed: 'error',
};

/** The authentication code AADE returned with the MARK. Logged-in only: fiscal_submissions is RLS-scoped. */
export function useFiscalAuthCode(documentTable: string, documentId: string, mark: string | null): string | null {
  const [authCode, setAuthCode] = useState<string | null>(null);
  useEffect(() => {
    if (!mark) { setAuthCode(null); return; }
    let live = true;
    supabase.from('fiscal_submissions')
      .select('authentication_code')
      .eq('document_table', documentTable).eq('document_id', documentId).eq('mark', mark)
      .not('authentication_code', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (live) setAuthCode((data as { authentication_code: string | null } | null)?.authentication_code ?? null); });
    return () => { live = false; };
  }, [documentTable, documentId, mark]);
  return authCode;
}

export const FiscalRecordPanel: React.FC<{
  record: FiscalRecord;
  authenticationCode?: string | null;
  onSend?: () => void;
  sending?: boolean;
}> = ({ record, authenticationCode: authCode, onSend, sending }) => {

  const held = record.fiscal_status === 'accepted' || record.fiscal_status === 'offline';
  const links = fiscalLinks(record);
  return (
    <HubPanel title="myDATA">
      <HubPropertyList>
        <HubProperty label="Status">
          {record.fiscal_status
            ? <Badge variant={STATUS_VARIANT[record.fiscal_status] ?? 'neutral'}>{record.fiscal_status}</Badge>
            : <Badge variant="warning">Not sent</Badge>}
          {record.fiscal_cancellation_mark && <Badge variant="warning" className="ml-1.5">Cancelled at AADE</Badge>}
        </HubProperty>
        <HubProperty label="MARK">{record.fiscal_mark ? <span className="font-mono text-xs">{record.fiscal_mark}</span> : null}</HubProperty>
        <HubProperty label="UID">{record.fiscal_uid ? <span className="break-all font-mono text-xs">{record.fiscal_uid}</span> : null}</HubProperty>
        <HubProperty label="Authentication code">{authCode ? <span className="break-all font-mono text-xs">{authCode}</span> : null}</HubProperty>
        <HubProperty label="Transmitted">{record.fiscal_submitted_at ? formatDate(record.fiscal_submitted_at, { withTime: true }) : null}</HubProperty>
        {record.fiscal_cancellation_mark && (
          <HubProperty label="Cancellation MARK"><span className="font-mono text-xs">{record.fiscal_cancellation_mark}</span></HubProperty>
        )}
        {record.fiscal_error && !held && (
          <HubProperty label="Provider response"><span className="text-destructive">{record.fiscal_error}</span></HubProperty>
        )}
      </HubPropertyList>
      {(links.length > 0 || (!held && onSend)) && (
        <div className="mt-3 flex flex-col gap-1.5">
          {links.map((l) => (
            <Button key={l.href} asChild size="sm" variant="outline" className="justify-start">
              <a href={l.href} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{l.label}</a>
            </Button>
          ))}
          {!held && onSend && (
            <Button size="sm" onClick={onSend} disabled={sending} className="justify-start">
              {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              {record.fiscal_status ? 'Retry sending to myDATA' : 'Send to myDATA'}
            </Button>
          )}
        </div>
      )}
    </HubPanel>
  );
};
