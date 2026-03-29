import React, { useEffect, useState } from 'react';
import { Building2, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface RegistrationRequest {
  id: string;
  user_id: string;
  company_name: string;
  factory_claimed_name: string;
  professional_type: string;
  message: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  user_profiles?: { full_name?: string; email?: string } | null;
}

export const FactoryRegistrationsTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('factory_registration_requests')
      .select('*, user_profiles(full_name)')
      .order('created_at', { ascending: false });
    if (data) setRequests(data as RegistrationRequest[]);
    setLoading(false);
  };

  const approve = async (req: RegistrationRequest) => {
    if (!user) return;
    setProcessingId(req.id);
    try {
      const { error } = await supabase.rpc('admin_approve_factory_registration', {
        p_request_id: req.id,
        p_reviewer_id: user.id,
      });
      if (error) throw error;
      setRequests((prev) =>
        prev.map((r) => r.id === req.id ? { ...r, status: 'approved' } : r),
      );
      supabase.from('user_notifications').insert({
        user_id: req.user_id,
        type: 'factory_approved',
        title: 'Factory registration approved!',
        body: `Your registration for ${req.company_name} has been approved. You are now a verified factory.`,
        action_url: '/profile',
        is_read: false,
        metadata: { request_id: req.id, company_name: req.company_name },
      }).then(() => {});
      toast({ title: 'Approved', description: `${req.company_name} is now a verified factory.` });
    } catch {
      toast({ title: 'Error', description: 'Could not approve request.', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const reject = async (req: RegistrationRequest) => {
    if (!user) return;
    setProcessingId(req.id);
    try {
      const { error } = await supabase.rpc('admin_reject_factory_registration', {
        p_request_id: req.id,
        p_reviewer_id: user.id,
        p_reason: rejectReason.trim() || null,
      });
      if (error) throw error;
      setRequests((prev) =>
        prev.map((r) => r.id === req.id ? { ...r, status: 'rejected', rejection_reason: rejectReason.trim() || null } : r),
      );
      supabase.from('user_notifications').insert({
        user_id: req.user_id,
        type: 'factory_rejected',
        title: 'Factory registration not approved',
        body: rejectReason.trim() || `Your registration for ${req.company_name} was not approved at this time.`,
        action_url: null,
        is_read: false,
        metadata: { request_id: req.id, company_name: req.company_name },
      }).then(() => {});
      setRejectingId(null);
      setRejectReason('');
      toast({ title: 'Rejected', description: 'Request has been rejected.' });
    } catch {
      toast({ title: 'Error', description: 'Could not reject request.', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'pending') return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
    if (s === 'approved') return 'bg-green-500/10 text-green-700 border-green-500/30';
    return 'bg-destructive/10 text-destructive border-destructive/30';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Factory Registration Requests</h3>
          {requests.filter((r) => r.status === 'pending').length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {requests.filter((r) => r.status === 'pending').length} pending
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={loadRequests}>Refresh</Button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No registration requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="rounded-xl border bg-card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{req.company_name}</p>
                      <Badge variant="outline" className="text-xs capitalize">{req.professional_type}</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Claims: <span className="font-medium text-foreground">{req.factory_claimed_name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      By: {req.user_profiles?.full_name || req.user_id.slice(0, 8)} · {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {req.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => approve(req)}
                          disabled={processingId === req.id}
                        >
                          {processingId === req.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1.5">Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-destructive hover:text-destructive hover:border-destructive/50"
                          onClick={() => setRejectingId(req.id)}
                          disabled={processingId === req.id}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span className="ml-1.5">Reject</span>
                        </Button>
                      </>
                    )}
                    {req.message && (
                      <button
                        onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {expandedId === req.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Rejection reason display */}
                {req.status === 'rejected' && req.rejection_reason && (
                  <p className="text-xs text-muted-foreground mt-2 italic">Reason: {req.rejection_reason}</p>
                )}

                {/* Message expansion */}
                {expandedId === req.id && req.message && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground border">
                    {req.message}
                  </div>
                )}

                {/* Rejection form */}
                {rejectingId === req.id && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (optional)"
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => reject(req)}
                        disabled={processingId === req.id}
                      >
                        {processingId === req.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                        Confirm Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
