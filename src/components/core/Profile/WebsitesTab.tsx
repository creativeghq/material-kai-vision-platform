import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ConnectedWebsitesTab } from '@/components/core/Profile/ConnectedWebsitesTab';
import { type UserWebsite } from '@/services/userWebsitesService';
import { useToast } from '@/hooks/use-toast';

/** `/websites/:id`, optionally opening one pane of it. */
const detailPath = (id: string, section?: string | null) =>
  `/websites/${id}${section ? `?section=${encodeURIComponent(section)}` : ''}`;

/**
 * Websites (My Profile) — the connected-site list. One site opens at `/websites/:id`, a page of
 * its own: the dashboard's 23 sections are a rail, and a rail inside the profile rail is two
 * sidebars on one screen.
 *
 * Also where the Google Search Console OAuth return lands: gsc-api handles the callback
 * SERVER-SIDE and 302s back to
 * `/profile?tab=websites&gsc=<connected|pick_property|error>&website=<id>`.
 */
export const WebsitesTab: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledReturn = useRef(false);

  const websiteId = searchParams.get('website') || '';
  const gsc = searchParams.get('gsc');

  useEffect(() => {
    if (!gsc || handledReturn.current) return;
    handledReturn.current = true;
    const returningTo = searchParams.get('website') || '';
    const msg = searchParams.get('msg') || '';

    if (gsc === 'connected') toast({ title: 'Search Console connected', description: 'Pulled your latest performance data.' });
    else if (gsc === 'pick_property') toast({ title: 'Almost there', description: 'Connected — pick which Search Console property to use.' });
    else toast({ title: 'Google connection failed', description: msg || 'Please try connecting again.', variant: 'destructive' });

    // Google's own params are noise and go; the site is what the operator was sent away from.
    if (returningTo) navigate(detailPath(returningTo, 'gsc'), { replace: true });
    else {
      const next = new URLSearchParams(searchParams);
      ['gsc', 'msg', 'scope', 'authuser', 'prompt', 'hd'].forEach((k) => next.delete(k));
      next.set('tab', 'websites');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * `?website=` addressed the dashboard while it was a pane here. Every such link — a bookmark, an
   * emailed report, an in-flight OAuth round trip — is answered rather than dropped on the list
   * with no explanation.
   */
  useEffect(() => {
    if (!websiteId || gsc) return;
    navigate(detailPath(websiteId, searchParams.get('section')), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId, gsc]);

  const openWebsite = (w: UserWebsite) => navigate(detailPath(w.id));

  if (websiteId || gsc) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        {gsc ? 'Finishing Google Search Console connection…' : 'Opening website…'}
      </div>
    );
  }

  return <ConnectedWebsitesTab onOpen={openWebsite} />;
};

export default WebsitesTab;
