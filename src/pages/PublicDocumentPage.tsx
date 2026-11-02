import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Download, ExternalLink, Loader2, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { publicDocumentService, type PublicDocumentPayload } from '@/modules/finance/services/publicDocumentService';
import { PublicDocumentView } from '@/modules/finance/components/PublicDocumentView';
import { fiscalLinks } from '@/modules/finance/components/FiscalRecordPanel';

/** /d/:token — the customer's (or supplier's) online copy of a credit note, delivery note or order. */
export default function PublicDocumentPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<PublicDocumentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    publicDocumentService.fetch(token)
      .then((p) => {
        if (cancelled) return;
        // An invoice link belongs on the pay page, which adds the payment panel.
        if (p.kind === 'invoice') { window.location.replace(`/pay/${token}`); return; }
        setPayload(p);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [token]);

  const rendered = useMemo(() => (payload ? publicDocumentService.render(payload) : null), [payload]);

  useEffect(() => {
    if (rendered) document.title = `${rendered.data.title} ${payload?.document.internal_number ?? ''}`.trim();
  }, [rendered, payload]);

  const download = async () => {
    setDownloading(true);
    try {
      window.open(await publicDocumentService.pdfUrl(token), '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  if (error && !payload) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-start justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-start gap-3 py-6 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!payload || !rendered) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const links = fiscalLinks({
    fiscal_status: null,
    fiscal_mark: payload.document.fiscal_mark ?? null,
    fiscal_aade_qr_url: payload.document.fiscal_aade_qr_url ?? null,
    fiscal_qr_url: payload.document.fiscal_qr_url ?? null,
  });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-[830px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{rendered.data.title} {payload.document.internal_number ?? ''}</div>
            <div className="text-xs text-muted-foreground">
              {rendered.data.issuer.name}
              {payload.related?.number ? ` · for invoice ${payload.related.number}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <Button key={l.href} asChild size="sm" variant="outline" className="gap-1.5">
                <a href={l.href} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{l.label}</a>
              </Button>
            ))}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {payload.pdf_available && (
              <Button size="sm" className="gap-1.5" onClick={download} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive print:hidden">{error}</p>}
        <PublicDocumentView rendered={rendered} />
      </div>
    </div>
  );
}
