import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { WebsiteSeoDashboard } from '@/components/core/Profile/WebsiteSeoDashboard';
import { userWebsitesService, type UserWebsite } from '@/services/userWebsitesService';
import { useToast } from '@/hooks/use-toast';

const WEBSITE_LIST = '/profile?tab=websites';

export const WebsiteDetailPage: React.FC = () => {
  const { websiteId = '' } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [website, setWebsite] = useState<UserWebsite | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWebsite(null);
    (async () => {
      try {
        const site = await userWebsitesService.get(websiteId);
        if (cancelled) return;
        if (site) setWebsite(site);
        else navigate(WEBSITE_LIST, { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        toast({ title: 'Could not open that website', description: e?.message, variant: 'destructive' });
        navigate(WEBSITE_LIST, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [websiteId, navigate, toast]);

  if (!website) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Opening website…
      </div>
    );
  }

  return <WebsiteSeoDashboard website={website} />;
};

export default WebsiteDetailPage;
