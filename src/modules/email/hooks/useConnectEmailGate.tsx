import React, { useCallback, useState } from 'react';
import { ConnectEmailModal } from '@/modules/email/components/ConnectEmailModal';
import {
  unwrapEmailSendError, isSenderNotConfiguredCode, notifyEmailSenderNotConfigured,
} from '@/modules/email/lib/emailSenderGate';

/**
 * Reusable gate for any surface that sends tenant business email (quotes, invoices, statements,
 * catalog, POs). Drop it into a component:
 *
 *   const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
 *   ...
 *   catch (err) {
 *     if (await handleEmailSendError(err, { workspaceId, feature: 'quote' })) return; // modal shown
 *     toast({ description: (err as Error).message, variant: 'destructive' });         // other error
 *   }
 *   ...
 *   return (<>{yourUI}{connectEmailGate}</>);
 *
 * When the send was blocked because the workspace has no BYOK sender, it opens the Connect-email
 * modal, raises the admin bell, and returns true so the caller skips its raw error toast.
 */
export function useConnectEmailGate() {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<string | undefined>();

  const handleEmailSendError = useCallback(async (
    err: unknown,
    opts: { workspaceId?: string | null; feature: string },
  ): Promise<boolean> => {
    const { code } = await unwrapEmailSendError(err);
    if (!isSenderNotConfiguredCode(code)) return false;
    setFeature(opts.feature);
    setOpen(true);
    await notifyEmailSenderNotConfigured({ workspaceId: opts.workspaceId, feature: opts.feature });
    return true;
  }, []);

  const connectEmailGate = (
    <ConnectEmailModal open={open} onClose={() => setOpen(false)} feature={feature} />
  );

  return { handleEmailSendError, connectEmailGate };
}
