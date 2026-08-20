/**
 * supplier-facing entry point to request access to a factory's catalog. Renders on a
 * verified-factory profile (not your own). Submits a factory_access_request from your active
 * workspace; the operator reviews it. Reflects the current state (request / pending / granted).
 */
import React, { useEffect, useState } from 'react';
import { KeyRound, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { factoryAccessService, type FactoryAccessStatus } from '@/services/factoryAccessService';

export const RequestFactoryAccessButton: React.FC<{ factoryUserId: string; show: boolean }> = ({ factoryUserId, show }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [status, setStatus] = useState<FactoryAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show || !activeWorkspaceId) { setLoading(false); return; }
    let cancelled = false;
    factoryAccessService.listMine(activeWorkspaceId)
      .then((rows) => { if (!cancelled) setStatus(rows.find((r) => r.factory_user_id === factoryUserId)?.status ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [show, activeWorkspaceId, factoryUserId]);

  if (!show || loading || !activeWorkspaceId) return null;

  if (status === 'approved') {
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1"><Check className="h-3 w-3" /> Catalog access</Badge>;
  }
  if (status === 'pending') {
    return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3" /> Access requested</Badge>;
  }

  const request = async () => {
    try {
      setBusy(true);
      await factoryAccessService.requestAccess(activeWorkspaceId, factoryUserId);
      setStatus('pending');
      toast({ title: 'Access requested', description: 'The operator will review your request.' });
    } catch (e: any) {
      toast({ title: 'Request failed', description: e?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Button variant="outline" size="sm" className="gap-2 px-4" onClick={request} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
      {status === 'rejected' ? 'Request access again' : 'Request catalog access'}
    </Button>
  );
};
