import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ConnectedWebsitesTab } from '@/components/core/Profile/ConnectedWebsitesTab';
import { WebsiteSeoDashboard } from '@/components/core/Profile/WebsiteSeoDashboard';
import { userWebsitesService, type UserWebsite } from '@/services/userWebsitesService';
import { useToast } from '@/hooks/use-toast';

/**
 * Websites (My Profile) — the connected-site list, and `?website=<id>` opens that site's SEO
 * dashboard. The dashboard's own pane is `?section=`.
 *
 * Also where the Google Search Console OAuth return lands: gsc-api handles the callback
 * SERVER-SIDE and 302s back to
 * `/profile?tab=websites&gsc=<connected|pick_property|error>&website=<id>`.
 */
export const WebsitesTab: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<UserWebsite | null>(null);
  const [returning, setReturning] = useState(false);
  const handledReturn = useRef(false);

  const websiteId = searchParams.get('website') || '';

  useEffect(() => {
    const gsc = searchParams.get('gsc');
    if (!gsc || handledReturn.current) return;
    handledReturn.current = true;
    const returningTo = searchParams.get('website') || '';
    const msg = searchParams.get('msg') || '';

    setReturning(true);
    (async () => {
      try {
        if (gsc === 'connected') toast({ title: 'Search Console connected', description: 'Pulled your latest performance data.' });
        else if (gsc === 'pick_property') toast({ title: 'Almost there', description: 'Connected — pick which Search Console property to use.' });
        else toast({ title: 'Google connection failed', description: msg || 'Please try connecting again.', variant: 'destructive' });
      } finally {
        // `website` is KEPT: it is what re-opens the dashboard the operator was sent away from.
        // The Google-side params are noise and go.
        const next = new URLSearchParams(searchParams);
        ['gsc', 'msg', 'scope', 'authuser', 'prompt', 'hd'].forEach((k) => next.delete(k));
        next.set('tab', 'websites');
        if (returningTo) next.set('section', 'gsc');
        setSearchParams(next, { replace: true });
        setReturning(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearWebsite = () => {
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    next.delete('website');
    next.delete('section');
    next.set('tab', 'websites');
    setSearchParams(next);
  };

  const openWebsite = (w: UserWebsite) => {
    setSelected(w);
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'websites');
    next.set('website', w.id);
    // Deliberately not carrying `section` over: the pane you were reading on the LAST site is not
    // the one you asked for on this one, and a stale `?section=` would silently redirect the open.
    next.delete('section');
    setSearchParams(next);
  };

  /**
   * Resolve `?website=` into the row the dashboard renders. This is what makes the URL real rather
   * than decorative: on a cold load or a refresh there is no `selected` in memory to fall back on.
   * An id naming a site this workspace cannot read drops back to the list rather than hanging on a
   * spinner — RLS answers "no row", which is indistinguishable from a stale bookmark and is
   * treated as one.
   */
  useEffect(() => {
    if (!websiteId) { setSelected(null); return; }
    if (selected?.id === websiteId) return;
    let cancelled = false;
    (async () => {
      try {
        const site = await userWebsitesService.get(websiteId);
        if (cancelled) return;
        if (site) setSelected(site);
        else clearWebsite();
      } catch {
        if (!cancelled) clearWebsite();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);


  if (returning) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Finishing Google Search Console connection…
      </div>
    );
  }

  // `?website=` is set but the row has not arrived yet. Rendering the list here would flash it for
  // a beat and then replace it, which reads as a bug on every refresh of a dashboard link.
  if (websiteId && !selected) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Opening website…
      </div>
    );
  }

  if (selected) {
    return <WebsiteSeoDashboard website={selected} onBack={clearWebsite} />;
  }
  return <ConnectedWebsitesTab onOpen={openWebsite} />;
};

export default WebsitesTab;
