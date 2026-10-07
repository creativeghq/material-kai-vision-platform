import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { normalizeSignatureCard, renderSignatureText, type SignatureCard } from '@/utils/emailSignature';

export interface ComposerSettings {
  email_signature: string;
  signature_card: SignatureCard | null;
  autocomplete_enabled: boolean;
}

const DEFAULTS: ComposerSettings = { email_signature: '', signature_card: null, autocomplete_enabled: false };

/** What inbox-api appends to an email from this person: the designed card wins over the plain text. */
export function signaturePreviewText(settings: ComposerSettings): string {
  return settings.signature_card ? renderSignatureText(settings.signature_card) : settings.email_signature.trim();
}

/** One person's reply-box preferences in one workspace. A missing row means the defaults. */
export function useComposerSettings(workspaceId: string | null | undefined, userId: string | null) {
  const [settings, setSettings] = useState<ComposerSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(DEFAULTS);
    setLoaded(false);
    if (!workspaceId || !userId) return;
    let live = true;
    const load = () => {
      void supabase.from('inbox_composer_settings')
        .select('email_signature, signature_card, autocomplete_enabled')
        .eq('user_id', userId).eq('workspace_id', workspaceId).maybeSingle()
        .then(({ data, error }) => {
          if (!live) return;
          if (error) console.warn('[inbox] composer settings not loaded', error.message);
          else setSettings(data ? {
            email_signature: data.email_signature ?? '',
            signature_card: normalizeSignatureCard(data.signature_card),
            autocomplete_enabled: !!data.autocomplete_enabled,
          } : DEFAULTS);
          setLoaded(true);
        });
    };
    load();
    // The signature is edited in Profile, often in another tab.
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { live = false; document.removeEventListener('visibilitychange', onFocus); };
  }, [workspaceId, userId]);

  const save = useCallback(async (patch: Partial<ComposerSettings>): Promise<string | null> => {
    if (!workspaceId || !userId) return 'Not signed in';
    const card = patch.signature_card !== undefined ? normalizeSignatureCard(patch.signature_card) : undefined;
    // Only the patched columns: settings may still be the defaults (not loaded, or the read failed).
    const row = {
      user_id: userId, workspace_id: workspaceId,
      ...(patch.email_signature !== undefined ? { email_signature: patch.email_signature.slice(0, 2000) } : {}),
      ...(card !== undefined ? { signature_card: card as unknown as Json } : {}),
      ...(patch.autocomplete_enabled !== undefined ? { autocomplete_enabled: patch.autocomplete_enabled } : {}),
    };
    const { error } = await supabase.from('inbox_composer_settings').upsert(row);
    if (error) return error.message;
    setSettings((cur) => ({ ...cur, ...patch, ...(card !== undefined ? { signature_card: card } : {}) }));
    return null;
  }, [workspaceId, userId]);

  return { settings, loaded, save };
}
