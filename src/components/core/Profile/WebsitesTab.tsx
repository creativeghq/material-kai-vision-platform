import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ConnectedWebsitesTab } from '@/components/core/Profile/ConnectedWebsitesTab';
import { WebsiteSeoDashboard } from '@/components/core/Profile/WebsiteSeoDashboard';
import { userWebsitesService, type UserWebsite } from '@/services/userWebsitesService';
import { useToast } from '@/hooks/use-toast';

/**
 * Websites tab (My Profile) — two-level surface:
 *   list of connected websites  →  per-website SEO dashboard.
 * Also the landing spot for the Google Search Console OAuth return. The OAuth
 * callback is handled SERVER-SIDE by gsc-api (Google redirects to the function,
 * not here — see that function's header), which then 302s back to
 * /profile?tab=websites&gsc=<connected|pick_property|error>&website=<id>. We just
 * read that flag, open the site's dashboard on the Search Performance tab, and toast.
 */
export const WebsitesTab: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<UserWebsite | null>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);
  const [returning, setReturning] = useState(false);
  const handledReturn = useRef(false);

  useEffect(() => {
    const gsc = searchParams.get('gsc');
    if (!gsc || handledReturn.current) return;
    handledReturn.current = true;
    const websiteId = searchParams.get('website') || '';
    const msg = searchParams.get('msg') || '';

    setReturning(true);
    (async () => {
      try {
        if (gsc === 'connected') toast({ title: 'Search Console connected', description: 'Pulled your latest performance data.' });
        else if (gsc === 'pick_property') toast({ title: 'Almost there', description: 'Connected — pick which Search Console property to use.' });
        else toast({ title: 'Google connection failed', description: msg || 'Please try connecting again.', variant: 'destructive' });

        if (websiteId) {
          const site = await userWebsitesService.get(websiteId);
          if (site) { setSelected(site); setInitialTab('gsc'); }
        }
      } finally {
        const next = new URLSearchParams(searchParams);
        ['gsc', 'website', 'msg', 'scope', 'authuser', 'prompt', 'hd'].forEach((k) => next.delete(k));
        next.set('tab', 'websites');
        setSearchParams(next, { replace: true });
        setReturning(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (returning) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Finishing Google Search Console connection…
      </div>
    );
  }

  if (selected) {
    return <WebsiteSeoDashboard website={selected} initialTab={initialTab} onBack={() => { setSelected(null); setInitialTab(undefined); }} />;
  }
  return <ConnectedWebsitesTab onOpen={(w) => { setSelected(w); setInitialTab(undefined); }} />;
};

export default WebsitesTab;
