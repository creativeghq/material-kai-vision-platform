import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ComposerSettings { email_signature: string; autocomplete_enabled: boolean }

const DEFAULTS: ComposerSettings = { email_signature: '', autocomplete_enabled: false };
/** RFC 3676 signature delimiter: mail clients recognise "-- " on its own line and fold what follows. */
export const SIGNATURE_DELIMITER = '\n\n-- \n';

export function withSignature(body: string, signature: string): string {
  const sig = signature.trim();
  return sig && body ? `${body}${SIGNATURE_DELIMITER}${sig}` : body;
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
    void supabase.from('inbox_composer_settings')
      .select('email_signature, autocomplete_enabled')
      .eq('user_id', userId).eq('workspace_id', workspaceId).maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) console.warn('[inbox] composer settings not loaded', error.message);
        if (data) setSettings({ email_signature: data.email_signature ?? '', autocomplete_enabled: !!data.autocomplete_enabled });
        setLoaded(true);
      });
    return () => { live = false; };
  }, [workspaceId, userId]);

  const save = useCallback(async (patch: Partial<ComposerSettings>): Promise<string | null> => {
    if (!workspaceId || !userId) return 'Not signed in';
    // Only the patched columns: settings may still be the defaults (not loaded, or the read failed).
    const row = {
      user_id: userId, workspace_id: workspaceId,
      ...(patch.email_signature !== undefined ? { email_signature: patch.email_signature.slice(0, 2000) } : {}),
      ...(patch.autocomplete_enabled !== undefined ? { autocomplete_enabled: patch.autocomplete_enabled } : {}),
    };
    const { error } = await supabase.from('inbox_composer_settings').upsert(row);
    if (error) return error.message;
    setSettings((cur) => ({ ...cur, ...patch }));
    return null;
  }, [workspaceId, userId]);

  return { settings, loaded, save };
}
