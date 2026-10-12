import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { callSeoPublish } from '@/components/core/Profile/WordPressConnectionCard';

export const PublishToWordPressButtons: React.FC<{ articleId: string; disabled?: boolean; onPublished?: (url: string | null) => void }> = ({
  articleId, disabled, onPublished,
}) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);

  const send = async (status: 'draft' | 'publish') => {
    setBusy(status);
    try {
      const r = await callSeoPublish<{ url: string | null; status: string }>({ action: 'publish', article_id: articleId, status }, 'Could not publish');
      toast({
        title: status === 'publish' ? 'Published to WordPress' : 'Saved as a WordPress draft',
        description: r.url ?? undefined,
      });
      onPublished?.(status === 'publish' ? r.url : null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Not published',
        description: /Connect your WordPress site/.test(message)
          ? <span>{message} <Link className="underline" to="/profile?tab=keys&section=publishing">Open Keys</Link></span>
          : message,
        variant: 'destructive',
      });
    } finally { setBusy(null); }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void send('draft')} disabled={disabled || !!busy} title="Create or update a draft post on your WordPress site">
        {busy === 'draft' ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />} WordPress draft
      </Button>
      <Button variant="outline" size="sm" onClick={() => void send('publish')} disabled={disabled || !!busy} title="Publish the post live on your WordPress site">
        {busy === 'publish' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Publish
      </Button>
    </>
  );
};
