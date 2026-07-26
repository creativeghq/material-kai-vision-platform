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
 * Also the landing spot for the Google Search Console OAuth return: Google redirects
 * to /profile?tab=websites&code=…&state=…; we finish the connection and open that
 * site's dashboard on the Search Performance tab.
 */
export const WebsitesTab: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<UserWebsite | null>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>(undefined);
  const [finishingOAuth, setFinishingOAuth] = useState(false);
  const handledOAuth = useRef(false);

  // Finish a Google Search Console OAuth redirect, if present.
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code || !state || handledOAuth.current) return;
    handledOAuth.current = true;
    const websiteId = state.split('.')[0]; // state = "<website_id>.<ts>.<sig>"
    setFinishingOAuth(true);
    (async () => {
      try {
        const site = await userWebsitesService.get(websiteId);
        await userWebsitesService.gscCallback(websiteId, code, state);
        if (site) { setSelected(site); setInitialTab('gsc'); }
        toast({ title: 'Search Console connected', description: 'Pulling your latest performance data…' });
      } catch (e: any) {
        toast({ title: 'Google connection failed', description: e.message, variant: 'destructive' });
      } finally {
        // Strip the OAuth params but keep the tab.
        const next = new URLSearchParams(searchParams);
        next.delete('code'); next.delete('state'); next.delete('scope'); next.delete('authuser'); next.delete('prompt');
        next.set('tab', 'websites');
        setSearchParams(next, { replace: true });
        setFinishingOAuth(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (finishingOAuth) {
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
