/**
 * OAuth callback for the Revolut Business consent flow (#315).
 *
 * Registered in the Revolut dashboard as `<origin>/revolut/callback`. Revolut lands here
 * with `?code=...`; we exchange it (edge-side, signed with the workspace's private key),
 * auto-register the transaction webhook, then return to the module settings page.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { callRevolutApi } from '../services/revolutConfigService';

const SETTINGS_PATH = '/admin/modules/banking-revolut/settings';

export const RevolutCallbackPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // React 18 StrictMode double-mounts effects; the code is single-use, so guard it.
    if (ran.current || !activeWorkspaceId) return;
    ran.current = true;

    const code = params.get('code');
    if (!code) {
      setError(params.get('error_description') || 'Revolut returned no authorisation code.');
      return;
    }

    void (async () => {
      try {
        await callRevolutApi('oauth-complete', activeWorkspaceId, { code });
        // Best-effort: webhook registration can be redone from the card if it fails here.
        await callRevolutApi('register-webhook', activeWorkspaceId).catch(() => undefined);
        navigate(SETTINGS_PATH, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [activeWorkspaceId, params, navigate]);

  return (
    <div className="mx-auto max-w-md p-8">
      <Card className="dashboard-card">
        <CardContent className="space-y-3 py-8 text-center text-sm">
          {error ? (
            <>
              <p className="text-destructive">Revolut connection failed: {error}</p>
              <button className="text-primary underline" onClick={() => navigate(SETTINGS_PATH)}>
                Back to settings
              </button>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Completing the Revolut connection…</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RevolutCallbackPage;
