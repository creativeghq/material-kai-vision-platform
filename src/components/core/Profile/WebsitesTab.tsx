import React, { useState } from 'react';
import { ConnectedWebsitesTab } from '@/components/core/Profile/ConnectedWebsitesTab';
import { WebsiteSeoDashboard } from '@/components/core/Profile/WebsiteSeoDashboard';
import type { UserWebsite } from '@/services/userWebsitesService';

/**
 * Websites tab (My Profile) — two-level surface:
 *   list of connected websites  →  per-website SEO dashboard.
 * The list (ConnectedWebsitesTab) drives add/preview/crawl/edit/remove; clicking a
 * site opens its dashboard of everything the SEO plugin produced for it.
 */
export const WebsitesTab: React.FC = () => {
  const [selected, setSelected] = useState<UserWebsite | null>(null);

  if (selected) {
    return <WebsiteSeoDashboard website={selected} onBack={() => setSelected(null)} />;
  }
  return <ConnectedWebsitesTab onOpen={setSelected} />;
};

export default WebsitesTab;
