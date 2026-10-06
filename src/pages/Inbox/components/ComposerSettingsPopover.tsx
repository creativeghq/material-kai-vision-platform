import React, { useEffect, useState } from 'react';
import { Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Textarea } from '@/components/core/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { useToast } from '@/hooks/use-toast';
import type { ComposerSettings } from '../useComposerSettings';

export const ComposerSettingsPopover: React.FC<{
  settings: ComposerSettings;
  save: (patch: Partial<ComposerSettings>) => Promise<string | null>;
}> = ({ settings, save }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState(settings.email_signature);
  const [busy, setBusy] = useState<'signature' | 'autocomplete' | null>(null);
  useEffect(() => { if (open) setSignature(settings.email_signature); }, [open, settings.email_signature]);

  const run = async (which: 'signature' | 'autocomplete', patch: Partial<ComposerSettings>, done: string) => {
    setBusy(which);
    const err = await save(patch);
    setBusy(null);
    toast(err ? { title: 'Not saved', description: err, variant: 'destructive' } : { title: done });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="Reply settings: signature and autocomplete" className="p-2 rounded-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground">
          <Settings2 className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="inbox-signature" className="text-xs font-semibold">Email signature</Label>
          <Textarea
            id="inbox-signature" value={signature} maxLength={2000}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={'Maria Papadopoulou\nSales · Example Ltd\n+30 210 000 0000'}
            className="min-h-[88px] text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Added under your email replies. Yours only.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              disabled={busy !== null || signature === settings.email_signature}
              onClick={() => { void run('signature', { email_signature: signature }, signature.trim() ? 'Signature saved' : 'Signature removed'); }}>
              {busy === 'signature' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
            </Button>
          </div>
        </div>
        <div className="border-t border-hairline pt-3 flex items-start gap-3">
          <div className="flex-1 space-y-0.5">
            <Label htmlFor="inbox-autocomplete" className="text-xs font-semibold">AI autocomplete</Label>
            <p className="text-[11px] text-muted-foreground">
              Suggests how to finish your sentence when you pause typing; press Tab to accept.
              Each suggestion uses a small amount of credits, charged when it is fetched.
            </p>
          </div>
          <Switch
            id="inbox-autocomplete" checked={settings.autocomplete_enabled} disabled={busy !== null}
            onCheckedChange={(v) => { void run('autocomplete', { autocomplete_enabled: v }, v ? 'Autocomplete on' : 'Autocomplete off'); }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
