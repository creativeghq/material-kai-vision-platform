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

// Land back on Profile → Keys — the per-workspace BYOK home where the card lives.
// (The /admin/modules page renders the same card but is operator-flavoured surface.)
const SETTINGS_PATH = '/profile?tab=keys';

// MODULE-level guard, not a ref: remounts (auth/workspace context settling, router
// re-renders) create fresh component instances whose refs all start false, and two
// exchanges of the same single-use code burn it — observed live as paired POSTs 82ms
// apart, both 500. A code that has been sent once must never be sent again.
const consumedCodes = new Set<string>();

export const RevolutCallbackPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [waitingLong, setWaitingLong] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    // No session/workspace yet → we cannot exchange. Don't spin forever looking alive:
    // after 8s tell the operator what's wrong (usually: consent opened in a browser
    // that isn't logged into the app).
    if (!activeWorkspaceId) {
      const t = setTimeout(() => setWaitingLong(true), 8000);
      return () => clearTimeout(t);
    }
    if (ran.current) return;
    ran.current = true;

    const code = params.get('code');
    if (!code) {
      setError(params.get('error_description') || 'Revolut returned no authorisation code.');
      return;
    }
    if (consumedCodes.has(code)) return; // another instance is already exchanging it
    consumedCodes.add(code);

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
          ) : waitingLong ? (
            <>
              <p className="text-muted-foreground">
                Waiting for your workspace session… If this doesn&apos;t resolve, you are probably
                not logged in <em>in this browser</em>. Log in at app.materialshub.gr, then restart
                the connection from the Revolut card (the code in this page has expired).
              </p>
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
