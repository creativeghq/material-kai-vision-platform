import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, GitCompare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  applyEdition,
  listEditions,
  listNeedsNewSource,
  type EditionSummary,
  type NeedsNewSource,
} from '@/services/catalogEditionService';

interface Props {
  workspaceId: string;
  onApplied: () => void;
}

export const CatalogEditionsPanel: React.FC<Props> = ({ workspaceId, onApplied }) => {
  const { toast } = useToast();
  const [editions, setEditions] = useState<EditionSummary[]>([]);
  const [needs, setNeeds] = useState<NeedsNewSource[]>([]);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, n] = await Promise.all([listEditions(workspaceId), listNeedsNewSource(workspaceId)]);
      setEditions(e);
      setNeeds(n);
    } catch (error) {
      toast({ title: 'Could not load catalogue editions', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    if (workspaceId) void load();
  }, [workspaceId, load]);

  const handleApply = async (edition: EditionSummary) => {
    if (!confirm(`Apply ${edition.proposed} proposed change(s)? New products go live, missing ones are retired or flagged, changed ones are updated.`)) return;
    setApplying(edition.documentId);
    try {
      const r = await applyEdition(edition.documentId);
      toast({
        title: 'Edition applied',
        description: `${r.published} published, ${r.updated} updated, ${r.retired} retired, ${r.needs_replacement} need a new source, ${r.kept} kept.`,
      });
      await load();
      onApplied();
    } catch (error) {
      toast({ title: 'Apply failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  };

  if (editions.length === 0 && needs.length === 0) return null;

  return (
    <div className="space-y-4">
      {editions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Catalogue editions
            </CardTitle>
            <CardDescription>Nothing changes until you apply an edition.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {editions.map((e) => (
              <div key={e.documentId} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {e.label ? `${e.label} · ` : ''}{e.filename}
                  </div>
                  <div className="text-xs text-muted-foreground">Replaces {e.supersedesFilename ?? 'an earlier catalogue'}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="success">{e.counts.added} added</Badge>
                    <Badge variant="warning">{e.counts.removed} missing</Badge>
                    <Badge variant="info">{e.counts.changed} changed</Badge>
                    <Badge variant="neutral">{e.counts.unchanged} unchanged</Badge>
                  </div>
                </div>
                <Button size="sm" disabled={e.proposed === 0 || applying === e.documentId} onClick={() => void handleApply(e)}>
                  {applying === e.documentId ? <Loader2 className="h-4 w-4 animate-spin" /> : e.proposed === 0 ? 'Nothing to apply' : `Apply ${e.proposed} change(s)`}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {needs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs a new source</CardTitle>
            <CardDescription>The manufacturer dropped these in a newer catalogue. Find another supplier or replace them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {needs.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <Link to={`/admin/materials-data?productId=${p.id}`} className="hover:underline">{p.name}</Link>
                <span className="text-xs text-muted-foreground">{p.discontinuedOn ?? ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
