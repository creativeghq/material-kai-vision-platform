import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { useToast } from '@/hooks/use-toast';
import type { ComposerSettings } from '../useComposerSettings';

export const ComposerSettingsPopover: React.FC<{
  settings: ComposerSettings;
  save: (patch: Partial<ComposerSettings>) => Promise<string | null>;
}> = ({ settings, save }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const card = settings.signature_card;
  const plain = settings.email_signature.trim();

  const toggleAutocomplete = async (v: boolean) => {
    setBusy(true);
    const err = await save({ autocomplete_enabled: v });
    setBusy(false);
    toast(err ? { title: 'Not saved', description: err, variant: 'destructive' } : { title: v ? 'Autocomplete on' : 'Autocomplete off' });
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
          <p className="text-xs font-semibold">Email signature</p>
          <p className="text-xs text-muted-foreground">
            {card
              ? <>Signing as <span className="text-foreground">{card.name}</span>{card.title ? `, ${card.title}` : ''}.</>
              : plain ? 'A plain-text signature is added under your emails.' : 'No signature yet.'}
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
            <Link to="/profile?tab=profile#email-signature" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              {card || plain ? 'Edit in Profile' : 'Design one in Profile'}<ArrowRight />
            </Link>
          </Button>
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
            id="inbox-autocomplete" checked={settings.autocomplete_enabled} disabled={busy}
            onCheckedChange={(v) => { void toggleAutocomplete(v); }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
