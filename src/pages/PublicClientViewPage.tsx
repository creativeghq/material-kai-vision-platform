import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Box, Sun, Check, MessageSquare, FileText } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';

/**
 * /cv/:token — public, unauthenticated viewer for a shared project Client View.
 *
 * Renders the deck PDF (the static sheets) plus the interactive blocks the PDF
 * can't carry: a live 3D walkthrough (Marble), CSS lighting moods over the hero
 * render, a live FF&E table with pricing, and an inline approve/comment box.
 * Data + a fresh signed PDF URL come from the `client-view-public-share` edge
 * function, which validates the token and enforces public_share_enabled.
 */

interface CvSheet { id: string; sheet_type: string; title: string; }
interface CvFfeItem { room: string | null; name: string; dimensions: string | null; quantity: number; unit_price: number | null; line_total: number | null; }
interface CvFfe { currency: string; subtotal: number | null; vat_rate: number | null; vat_amount: number | null; grand_total: number | null; items: CvFfeItem[]; }
interface CvVrWorld { id: string; status: string; splat_url_100k: string | null; splat_url_500k: string | null; splat_url_full: string | null; panorama_url: string | null; thumbnail_url: string | null; }
/** WS4 #285 — handover snag list. The edge function sends only `client_visible` snags. */
interface CvSnag { id: string; title: string; status: string; room: string | null; resolved: boolean; photo_urls: string[]; }

interface ClientViewData {
  id: string;
  title: string;
  project_name: string | null;
  cover: { title?: string; subtitle?: string; client_name?: string; cover_image_url?: string; date?: string };
  sheets: CvSheet[];
  pdf_url: string | null;
  embed_vr: boolean;
  embed_lighting: boolean;
  embed_ffe: boolean;
  feedback_enabled: boolean;
  vr_world: CvVrWorld | null;
  ffe: CvFfe | null;
  lighting_image_url: string | null;
  snags?: CvSnag[];
}

const LIGHTING_PRESETS: { label: string; filter: string }[] = [
  { label: 'Daylight', filter: 'none' },
  { label: 'Golden Hour', filter: 'sepia(0.25) saturate(1.25) hue-rotate(-10deg) brightness(1.05)' },
  { label: 'Overcast', filter: 'saturate(0.82) brightness(0.95) contrast(0.95)' },
  { label: 'Warm Evening', filter: 'brightness(0.82) sepia(0.2) saturate(1.1) hue-rotate(-15deg)' },
  { label: 'Night', filter: 'brightness(0.55) saturate(0.85) hue-rotate(205deg) contrast(1.05)' },
];

import { formatMoney as money } from '@/utils/decimal';

export default function PublicClientViewPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ClientViewData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lightIdx, setLightIdx] = useState(0);

  // Feedback box
  const [authorName, setAuthorName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const sessionId = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoading(false); setNotFound(true); return; }
      try {
        const { data } = await supabase.functions.invoke('moodboard-sheet-share', {
          body: { token, session_id: sessionId.current },
        });
        if (cancelled) return;
        setView(data?.client_view ?? null);
        setNotFound(!!data?.not_found || !data?.client_view);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submitFeedback = async (kind: 'comment' | 'approval' | 'change_request', status?: 'approved' | 'changes_requested') => {
    if (!token) return;
    setSubmitting(true);
    try {
      await supabase.functions.invoke('moodboard-sheet-share', {
        body: {
          token,
          session_id: sessionId.current,
          feedback: { kind, status, author_name: authorName || null, body: comment || null },
        },
      });
      setSubmitted(
        status === 'approved' ? 'Thanks — your approval has been sent to the designer.'
        : status === 'changes_requested' ? 'Thanks — your change request has been sent.'
        : 'Thanks — your comment has been sent.',
      );
      setComment('');
    } catch {
      setSubmitted('Could not send right now — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !view) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <Card className="dashboard-card max-w-md w-full p-8 text-center">
          <FileText className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-lg font-semibold mb-2">Presentation not available</h1>
          <p className="text-sm text-muted-foreground">
            This link may have been disabled or has expired. Please ask your designer for an updated link.
          </p>
        </Card>
      </div>
    );
  }

  const coverTitle = view.cover?.title || view.title;
  const vr = view.vr_world;
  const vrUrl = vr?.splat_url_full || vr?.splat_url_500k || vr?.splat_url_100k || vr?.panorama_url || null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto">
          {view.project_name && (
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{view.project_name}</p>
          )}
          <h1 className="text-2xl sm:text-3xl font-semibold">{coverTitle}</h1>
          {view.cover?.subtitle && <p className="text-muted-foreground mt-1">{view.cover.subtitle}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-muted-foreground">
            {view.cover?.client_name && <span>Prepared for <strong className="text-foreground">{view.cover.client_name}</strong></span>}
            {view.cover?.date && <span>{view.cover.date.slice(0, 10)}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-10">
        {/* Deck PDF */}
        {view.pdf_url ? (
          <section>
            <div className="aspect-[1190/842] w-full border border-border rounded-lg overflow-hidden bg-muted">
              <iframe title="Presentation deck" src={view.pdf_url} className="w-full h-full" />
            </div>
            <div className="mt-3">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={view.pdf_url} target="_blank" rel="noreferrer">
                  <FileText className="h-4 w-4 mr-1" /> Download PDF
                </a>
              </Button>
            </div>
          </section>
        ) : (
          <Card className="dashboard-card p-6 text-sm text-muted-foreground">
            The presentation PDF is still being prepared. Please check back shortly.
          </Card>
        )}

        {/* 3D walkthrough */}
        {view.embed_vr && vr && vrUrl && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3"><Box className="h-5 w-5 text-primary" /> Explore the space in 3D</h2>
            <Card className="dashboard-card p-4 flex flex-col sm:flex-row gap-4 items-center">
              {vr.thumbnail_url && (
                <img src={vr.thumbnail_url} alt="3D world preview" className="w-full sm:w-56 rounded-md object-cover" />
              )}
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-3">
                  Walk through an explorable 3D reconstruction of the design.
                </p>
                <Button asChild className="rounded-full">
                  <a href={vrUrl} target="_blank" rel="noreferrer">Open 3D walkthrough</a>
                </Button>
              </div>
            </Card>
          </section>
        )}

        {/* Lighting moods */}
        {view.embed_lighting && view.lighting_image_url && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3"><Sun className="h-5 w-5 text-primary" /> See it under different lighting</h2>
            <div className="border border-border rounded-lg overflow-hidden bg-muted">
              <img
                src={view.lighting_image_url}
                alt="Lighting preview"
                className="w-full object-cover transition-[filter] duration-500"
                style={{ filter: LIGHTING_PRESETS[lightIdx].filter }}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {LIGHTING_PRESETS.map((p, i) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant={i === lightIdx ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => setLightIdx(i)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* Live FF&E */}
        {view.embed_ffe && view.ffe && view.ffe.items.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Furniture, Fixtures &amp; Equipment</h2>
            <Card className="dashboard-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3 font-medium">Room</th>
                      <th className="p-3 font-medium">Item</th>
                      <th className="p-3 font-medium">Dimensions</th>
                      <th className="p-3 font-medium text-right">Qty</th>
                      <th className="p-3 font-medium text-right">Unit</th>
                      <th className="p-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.ffe.items.map((it, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="p-3 text-muted-foreground">{it.room || '—'}</td>
                        <td className="p-3">{it.name}</td>
                        <td className="p-3 text-muted-foreground">{it.dimensions || '—'}</td>
                        <td className="p-3 text-right">{it.quantity}</td>
                        <td className="p-3 text-right">{money(it.unit_price, view.ffe!.currency)}</td>
                        <td className="p-3 text-right">{money(it.line_total, view.ffe!.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-right">
                      <td colSpan={5} className="p-3 text-muted-foreground">Subtotal</td>
                      <td className="p-3">{money(view.ffe.subtotal, view.ffe.currency)}</td>
                    </tr>
                    {view.ffe.vat_amount != null && (
                      <tr className="text-right">
                        <td colSpan={5} className="p-3 text-muted-foreground">VAT {view.ffe.vat_rate ? `(${view.ffe.vat_rate}%)` : ''}</td>
                        <td className="p-3">{money(view.ffe.vat_amount, view.ffe.currency)}</td>
                      </tr>
                    )}
                    <tr className="text-right font-semibold">
                      <td colSpan={5} className="p-3">Total</td>
                      <td className="p-3">{money(view.ffe.grand_total, view.ffe.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </section>
        )}

        {/* Handover snag list (WS4 #285) — only the snags the designer marked client-visible. */}
        {view.snags && view.snags.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Outstanding items</h2>
            <Card className="dashboard-card divide-y divide-white/8">
              {view.snags.map((s) => (
                <div key={s.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={s.resolved ? 'text-muted-foreground line-through' : 'font-medium'}>{s.title}</p>
                      {s.room && <span className="text-[11px] text-muted-foreground">· {s.room}</span>}
                    </div>
                    {s.photo_urls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {s.photo_urls.map((u) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer">
                            <img src={u} alt="" loading="lazy" className="h-16 w-16 rounded-md border border-white/10 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs ${s.resolved ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {s.resolved ? 'Done' : 'In progress'}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* Feedback / approval */}
        {view.feedback_enabled && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3"><MessageSquare className="h-5 w-5 text-primary" /> Your feedback</h2>
            <Card className="dashboard-card p-5 space-y-3">
              {submitted ? (
                <p className="text-sm text-emerald-400 flex items-center gap-2"><Check className="h-4 w-4" /> {submitted}</p>
              ) : (
                <>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                  />
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Leave a comment, or note any changes you'd like…"
                    rows={3}
                    className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="rounded-full"
                      disabled={submitting}
                      onClick={() => submitFeedback('approval', 'approved')}
                    >
                      <Check className="h-4 w-4 mr-1" /> Approve presentation
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      disabled={submitting || !comment}
                      onClick={() => submitFeedback('change_request', 'changes_requested')}
                    >
                      Request changes
                    </Button>
                    <Button
                      variant="ghost"
                      className="rounded-full"
                      disabled={submitting || !comment}
                      onClick={() => submitFeedback('comment')}
                    >
                      Send comment
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </section>
        )}

        <footer className="pt-4 pb-10 text-center text-xs text-muted-foreground">
          {view.sheets.length} sheet{view.sheets.length === 1 ? '' : 's'} · Prepared with Material Kai
        </footer>
      </main>
    </div>
  );
}
