import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FolderKanban, Loader2, Mail, AlertTriangle, CheckCircle2, Send } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { projectsService, type InvitationPreview } from '../services/projectsService';

/**
 * Invitation landing page — public, no auth required.
 *
 * 1. Reads share_token from the URL
 * 2. Loads invitation preview (masked email + project name) via SECURITY DEFINER RPC
 * 3. If invitee is already signed in with the matching email → auto-accept + redirect
 * 4. Otherwise → asks for email, calls signInWithOtp with redirect to /projects/accept-invite?token=X
 */
export const InviteLandingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [autoAccepting, setAutoAccepting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await projectsService.getInvitationPreview(token);
      setPreview(data);
    } catch (err) {
      toast({ title: 'Failed to load invitation', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => { load(); }, [load]);

  // Fast path: if user is already signed in (e.g. they were already a platform user),
  // skip the OTP step and try to accept immediately. The RPC checks the email match.
  useEffect(() => {
    const tryAutoAccept = async () => {
      if (!token || !user || !preview || preview.is_revoked || preview.is_expired || autoAccepting) return;
      setAutoAccepting(true);
      try {
        const result = await projectsService.acceptInvitation(token);
        navigate(`/projects/${result.project_id}`, { replace: true });
      } catch (err) {
        // Most likely cause: signed-in user's email doesn't match the invite.
        // Fall through to the email-entry form so they can sign out + retry with the right email.
        setAutoAccepting(false);
      }
    };
    tryAutoAccept();
  }, [user, preview, token, navigate, autoAccepting]);

  const handleSendMagicLink = async () => {
    if (!email.trim() || !token) return;
    try {
      setSending(true);
      const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${appUrl}/projects/accept-invite?token=${token}`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast({
        title: 'Failed to send sign-in link',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="dashboard-card max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h2 className="text-lg font-light mb-2">Invitation not found</h2>
            <p className="text-sm text-muted-foreground">
              This invite link is invalid or has been removed. Ask the project owner to send a new one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (preview.is_revoked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="dashboard-card max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h2 className="text-lg font-light mb-2">Access revoked</h2>
            <p className="text-sm text-muted-foreground">
              The project owner has revoked this invitation. Contact them if you need access again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (preview.is_expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="dashboard-card max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-300 mx-auto mb-3" />
            <h2 className="text-lg font-light mb-2">Invitation expired</h2>
            <p className="text-sm text-muted-foreground">
              This invitation has passed its expiry date. Ask the project owner to send a new one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (autoAccepting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Opening project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="dashboard-card max-w-md w-full">
        <CardContent className="p-8 space-y-5">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-3">
              <FolderKanban className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-light">You've been invited</h1>
            <p className="text-sm text-muted-foreground mt-1">
              to view <strong className="text-foreground">{preview.project_name}</strong>
            </p>
          </div>

          {sent ? (
            <div className="space-y-3 text-center pt-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-300 mx-auto" />
              <h3 className="font-medium">Check your email</h3>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <strong>{email}</strong>. Click it to view the project — no password needed.
              </p>
              <p className="text-xs text-muted-foreground pt-2">
                Don't see it? Check spam, or{' '}
                <button
                  type="button"
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="underline hover:text-foreground"
                >
                  try a different email
                </button>.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Confirm your email to continue</Label>
                <p className="text-xs text-muted-foreground">
                  This invitation was sent to <strong>{preview.invited_email_masked}</strong>.
                  Enter the matching email to sign in — we'll email you a one-click link.
                </p>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && email.trim()) handleSendMagicLink(); }}
                  placeholder="you@example.com"
                  disabled={sending}
                  autoFocus
                />
              </div>

              <Button onClick={handleSendMagicLink} disabled={sending || !email.trim()} className="w-full">
                {sending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Send sign-in link</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <Mail className="h-3 w-3" />
                No password needed
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
