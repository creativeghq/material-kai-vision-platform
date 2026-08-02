import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Download, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { SHEET_TYPE_LABELS } from '@/services/moodboardSheetsService';
import { supabase } from '@/integrations/supabase/client';

/**
 * /sheets/share/:token — public viewer for a shared presentation sheet.
 * Unauthenticated route. Fetches sheet metadata + a fresh signed PDF URL
 * via the moodboard-sheet-share edge function, which validates the token
 * and bumps view count.
 */
export default function SheetSharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoading(false); return; }
      try {
        const { data } = await supabase.functions.invoke('moodboard-sheet-share', {
          body: { token },
        });
        if (cancelled) return;
        setSheet(data?.sheet ?? null);
        setPdfUrl(data?.pdf_url ?? null);
        setExpired(!!data?.expired);
      } catch {
        if (!cancelled) { setSheet(null); setPdfUrl(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (expired) {
    return (
      <CenteredCard
        title="Link expired"
        body="The link to this presentation has expired. Ask the designer for an updated one."
      />
    );
  }

  if (!sheet || !pdfUrl) {
    return (
      <CenteredCard
        title="Not found"
        body="This share link is invalid or the presentation has been removed."
      />
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{sheet.title}</h1>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">
            {SHEET_TYPE_LABELS[sheet.sheet_type as keyof typeof SHEET_TYPE_LABELS] || sheet.sheet_type}
          </span>
          {sheet.page_count && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {sheet.page_count} page{sheet.page_count === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <Card className="dashboard-card overflow-hidden border border-white/15" style={{ aspectRatio: '4/3' }}>
          <iframe src={pdfUrl} className="w-full h-full" title={sheet.title} />
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => {
            const a = document.createElement('a');
            a.href = pdfUrl;
            a.download = `${sheet.title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
            a.target = '_blank';
            a.click();
          }}>
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => window.open(pdfUrl, '_blank')}>
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground text-center pt-4">
          Shared from Material Kai
        </div>
      </div>
    </div>
  );
}

function CenteredCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="dashboard-card p-8 text-center max-w-md space-y-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </Card>
    </div>
  );
}
