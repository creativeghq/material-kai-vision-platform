/**
 * WebsiteLlmsTxtPanel — generate this site's `llms.txt` from its crawled pages (#349 C2).
 *
 * The platform serves a hand-written `llms.txt` for itself and connected websites got
 * nothing. This derives one from `user_website_pages`, which the crawler already fills.
 *
 * It hands over TEXT, not a deployment: the file has to sit at the customer's own root,
 * and we do not control their host. Copy or download, then they place it — anything else
 * would be a button that claims to have published something it cannot reach.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Check, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildLlmsTxt } from '@/utils/llmsTxt';
import { userWebsitesService, type UserWebsite, type UserWebsitePage } from '@/services/userWebsitesService';

export const WebsiteLlmsTxtPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [pages, setPages] = useState<UserWebsitePage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // `activeOnly: false` on purpose — the generator decides what is publishable, and
      // it needs to SEE the dropped and 404ing pages to exclude them. Filtering here as
      // well would hide from the rule the rows it exists to reject.
      setPages(await userWebsitesService.listPages(website.id, { activeOnly: false, limit: 1000 }));
    } catch (e: any) {
      toast({ title: 'Could not load pages', description: e.message, variant: 'destructive' });
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [website.id, toast]);

  useEffect(() => { void load(); }, [load]);

  const text = useMemo(() => {
    if (!pages) return '';
    const homepage = /^https?:\/\//i.test(website.url) ? website.url : `https://${website.url}`;
    return buildLlmsTxt({
      siteName: website.display_name || website.url,
      siteUrl: homepage,
      // Deliberately not passed: nothing on `user_websites` is a human-written summary of
      // the site, and inventing one would put a sentence nobody wrote at the top of a file
      // published under their name.
      pages: pages.map((p) => ({
        url: p.url,
        title: p.title,
        description: p.description,
        http_status: p.http_status,
        is_active: p.is_active,
      })),
    });
  }, [pages, website.url, website.display_name]);

  const listed = useMemo(() => text.split('\n').filter((l) => l.startsWith('- [')).length, [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', description: 'Select the text and copy it manually.', variant: 'destructive' });
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'llms.txt';
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>llms.txt</CardTitle>
          <CardDescription>
            What an answer engine should read on this site, derived from the pages we have
            crawled. Serve it at <code>{website.url.replace(/\/+$/, '')}/llms.txt</code> — we can
            generate the file, but only you can put it on your domain.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Rebuild
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!text}>
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" onClick={download} disabled={!text}>
            <Download className="w-3.5 h-3.5 mr-1" /> Download
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Reading crawled pages…
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              {/* Both numbers, because the gap between them IS the interesting fact: pages
                  that 404 or have left the sitemap are excluded, and a customer looking at
                  a short file deserves to know why it is short. */}
              {listed} of {pages?.length ?? 0} crawled page(s) listed. Pages that returned an
              error or have left your sitemap are left out — a dead link is the one thing
              this file must not contain.
            </p>
            <pre className="text-xs bg-surface-sunken border border-hairline rounded-sm p-3 overflow-auto max-h-96 whitespace-pre-wrap">
              {text}
            </pre>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteLlmsTxtPanel;
