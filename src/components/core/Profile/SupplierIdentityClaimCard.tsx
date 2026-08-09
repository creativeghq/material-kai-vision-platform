import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Factory, Loader2, ShieldCheck, Clock, XCircle, Send, Boxes } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { supplierClaimsService, type MySupplierClaimStatus } from '@/services/supplierClaimsService';
import { formatDate } from '@/utils/datetime';

/**
 * The front door for a manufacturer (#324 phase 0).
 *
 * Registering a business is not the same as being recognised as a factory. This files the
 * claim; the platform operator then confirms that YOU represent that company before anything
 * you publish reaches the shared catalog. Without this card nobody could file a claim at all,
 * which is why the in-app purchase-order handoff had never fired for any order.
 */
export const SupplierIdentityClaimCard: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [status, setStatus] = useState<MySupplierClaimStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      setStatus(await supplierClaimsService.myClaimStatus(activeWorkspaceId));
    } catch {
      setStatus(null);
    } finally { setLoading(false); }
  }, [activeWorkspaceId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!activeWorkspaceId || !status?.own_vat || !status?.own_country) return;
    setBusy(true);
    try {
      await supplierClaimsService.requestClaim(activeWorkspaceId, status.own_vat, status.own_country);
      toast({
        title: 'Claim submitted',
        description: 'The platform operator will confirm your company before you can publish catalog data.',
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not submit', description: e?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your supplier identity…
        </CardContent>
      </Card>
    );
  }
  if (!status) return null;

  const canSubmit = !!status.own_vat && !!status.own_country;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-primary" /> Manufacturer identity
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Are you the manufacturer? Claim your company to receive purchase orders in-app and to
          publish your own product data — which then takes precedence over our catalog extraction.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.state === 'claimed' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium">{status.legal_name || status.vat_number}</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">confirmed</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {status.is_confirmed_contact
                ? 'You are the confirmed contact for this company, so you can publish its catalog data.'
                : 'This company is confirmed, but publishing is limited to the person the operator confirmed. Ask the operator to confirm you as well.'}
            </p>
            {/* Without this the publish surface has no entry point for a manufacturer —
                they are not an admin, so the operator dashboard is not theirs to browse. */}
            {status.is_confirmed_contact && (
              <Button size="sm" variant="outline" className="rounded-full h-8" asChild>
                <Link to="/admin/catalog-master">
                  <Boxes className="h-3.5 w-3.5 mr-1" /> Manage your catalog
                </Link>
              </Button>
            )}
          </div>
        ) : status.state === 'pending' ? (
          <div className="flex items-start gap-2 text-sm">
            <Clock className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p>Waiting for the operator to confirm <span className="font-medium">{status.vat_number}</span>.</p>
              <p className="text-xs text-muted-foreground">Submitted {status.created_at ? formatDate(status.created_at) : ''}.</p>
            </div>
          </div>
        ) : (
          <>
            {status.state === 'rejected' && (
              <div className="flex items-start gap-2 text-sm">
                <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                <div>
                  <p>Your previous claim was declined.</p>
                  {status.decision_reason && <p className="text-xs text-muted-foreground">{status.decision_reason}</p>}
                </div>
              </div>
            )}
            {canSubmit ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  Claim <span className="font-medium">{status.own_vat}</span>
                  <span className="text-muted-foreground"> · {status.own_country}</span>
                </span>
                <Button size="sm" className="rounded-full h-8" onClick={submit} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1" /> Request confirmation</>}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add your VAT number and country to your business identity above first — that is what
                identifies your company across the platform.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierIdentityClaimCard;
