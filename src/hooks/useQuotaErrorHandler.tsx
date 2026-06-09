/**
 * #214 — turn the DB `quota_exceeded` error into a friendly "Plan limit reached → Upgrade" toast.
 * The quota cap is enforced at the database (a trigger raises `quota_exceeded: …`), so every
 * create path surfaces the same error; wrap the catch with this to route it to the upsell.
 *
 *   const handleQuota = useQuotaErrorHandler();
 *   catch (err) { if (!handleQuota(err)) toast({ ...generic… }); }
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/core/ui/toast';

export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? '');
  return msg.includes('quota_exceeded');
}

export function useQuotaErrorHandler(): (err: unknown) => boolean {
  const { toast } = useToast();
  const navigate = useNavigate();

  return (err: unknown): boolean => {
    if (!isQuotaError(err)) return false;
    const raw = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
    // Strip the `quota_exceeded: ` prefix for the user-facing copy.
    const friendly = raw.replace(/^[\s\S]*?quota_exceeded:\s*/i, '').trim() || 'You’ve reached your plan’s limit.';
    toast({
      title: 'Plan limit reached',
      description: friendly,
      variant: 'destructive',
      action: (
        <ToastAction altText="Upgrade" onClick={() => navigate('/billing/subscriptions')}>
          Upgrade
        </ToastAction>
      ),
    });
    return true;
  };
}
