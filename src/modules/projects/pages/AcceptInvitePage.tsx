import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle, FolderKanban } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { projectsService } from '../services/projectsService';

/**
 * Magic-link landing target. The OTP email points here with ?token=<share_token>.
 *
 * By the time we arrive, Supabase Auth has already exchanged the OTP for a session
 * (handled by the auth callback flow). We verify the invitation + stamp user_id
 * via the accept_project_invitation RPC and redirect to the project.
 */
export const AcceptInvitePage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(true);

  const token = params.get('token');

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setError('Missing invitation token in URL.');
      setAccepting(false);
      return;
    }
    if (!user) {
      // Magic-link redirect didn't establish a session — bounce back to the invite landing
      navigate(`/projects/invite/${token}`, { replace: true });
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const result = await projectsService.acceptInvitation(token);
        if (cancelled) return;
        navigate(`/projects/${result.project_id}`, { replace: true });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to accept invitation');
        setAccepting(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [token, user, authLoading, navigate]);

  if (accepting && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="dashboard-card max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-light">Couldn't accept invitation</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          {token && (
            <Button variant="outline" onClick={() => navigate(`/projects/invite/${token}`, { replace: true })}>
              <FolderKanban className="h-4 w-4 mr-2" />
              Back to invitation
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
