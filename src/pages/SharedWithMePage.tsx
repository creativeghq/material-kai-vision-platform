import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Loader2, FolderKanban, Home, Palette } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { formatDate } from '@/utils/datetime';
import { supabase } from '@/integrations/supabase/client';

interface SharedRecord {
  record_type: 'project' | 'property' | 'moodboard';
  record_id: string;
  title: string;
  workspace_name: string | null;
  role: string | null;
  expires_at: string | null;
}

const KIND = {
  project: { icon: FolderKanban, label: 'Project', href: (id: string) => `/projects/${id}` },
  property: { icon: Home, label: 'Property', href: () => '/my-properties' },
  moodboard: { icon: Palette, label: 'Moodboard', href: (id: string) => `/moodboard/${id}` },
};

const SharedWithMePage: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<SharedRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('my_shared_records' as never);
      if (error) throw error;
      setRows((data ?? []) as SharedRecord[]);
    } catch (err) {
      toast({ title: 'Could not load what has been shared', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader icon={Share2} title="Shared with me" subtitle="Everything someone has given you access to" />
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            title="Nothing shared with you yet"
            description="When someone gives you access to a project, a property or a moodboard, it appears here."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => {
              const kind = KIND[r.record_type];
              const Icon = kind?.icon ?? FolderKanban;
              return (
                <Card key={`${r.record_type}:${r.record_id}`} className="panel-interactive">
                  <CardContent className="p-4">
                    <Link to={kind ? kind.href(r.record_id) : '#'} className="block">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-2 font-medium">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          {r.title}
                        </span>
                        <Badge variant="neutral">{kind?.label ?? r.record_type}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.workspace_name ?? 'Shared with you'}
                        {r.expires_at ? ` · access until ${formatDate(r.expires_at)}` : ''}
                      </p>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedWithMePage;
