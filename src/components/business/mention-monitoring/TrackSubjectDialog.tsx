/**
 * TrackSubjectDialog — start tracking a brand or keyword.
 *
 * `createTrackedMention` existed in the service layer with **zero callers**: the only way
 * to create a subject was curl or the agent tool. Every one of the 17 subjects on this
 * platform arrived that way, which is also why none of them carries a `homepage_domain`
 * — nothing ever asked for one.
 *
 * That field is not cosmetic. It is the only thing that makes a GHOST CITATION decidable:
 * an AI answer that used your page as its source without naming you. Without it
 * `brand_cited` is NULL for every probe — undecidable, which the UI reports honestly and
 * which no amount of probing will resolve.
 */

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  TrackedMention, MentionSubjectType, createTrackedMention,
} from '@/services/mentionMonitoringApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (row: TrackedMention) => void;
}

/** Strip a pasted URL down to a bare host. People paste `https://brand.gr/` — accept it. */
function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  const host = withoutScheme.split('/')[0].split('?')[0].split('#')[0];
  return host.replace(/^www\./, '');
}

export const TrackSubjectDialog: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [subjectType, setSubjectType] = useState<MentionSubjectType>('brand');
  const [label, setLabel] = useState('');
  const [aliases, setAliases] = useState('');
  const [homepageDomain, setHomepageDomain] = useState('');
  const [autoExpand, setAutoExpand] = useState(false);

  const reset = () => {
    setSubjectType('brand'); setLabel(''); setAliases('');
    setHomepageDomain(''); setAutoExpand(false);
  };

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const row = await createTrackedMention({
        subject_type: subjectType,
        subject_label: trimmed,
        brand_name: subjectType === 'brand' ? trimmed : undefined,
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        homepage_domain: normalizeDomain(homepageDomain) || undefined,
        auto_expand_aliases: autoExpand,
        run_first_refresh: true,
      });
      toast({
        title: `Tracking “${trimmed}”`,
        description: 'First discovery pass is running. LLM probes follow on the weekly cadence.',
      });
      reset();
      onCreated(row);
    } catch (e: any) {
      toast({ title: 'Could not start tracking', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Track a subject</DialogTitle>
          <DialogDescription>
            A brand or keyword to watch across news, blogs, RSS and AI answers. Products are
            enrolled from the product page instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject-type">Kind</Label>
            <Select value={subjectType} onValueChange={(v) => setSubjectType(v as MentionSubjectType)}>
              <SelectTrigger id="subject-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brand">Brand</SelectItem>
                <SelectItem value="keyword">Keyword / topic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-label">
              {subjectType === 'brand' ? 'Brand name' : 'Keyword or topic'}
            </Label>
            <Input
              id="subject-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={subjectType === 'brand' ? 'Flobali' : 'recycled concrete aggregates'}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-domain">Homepage domain</Label>
            <Input
              id="subject-domain"
              value={homepageDomain}
              onChange={(e) => setHomepageDomain(e.target.value)}
              placeholder="flobali.gr"
            />
            <p className="text-xs text-muted-foreground">
              Optional, but it is the only way we can tell a <strong>ghost citation</strong> — an AI
              answer that used one of your pages as its source without ever naming you. Leave it
              empty and that stays permanently undecidable, not zero.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-aliases">Also known as</Label>
            <Input
              id="subject-aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Comma separated — Flobali SA, Φλόμπαλη"
            />
            <p className="text-xs text-muted-foreground">
              Greek and Latin spellings both count as a hit. Add the ones a person would actually
              write.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-sm border border-hairline p-3">
            <div className="min-w-0">
              <Label htmlFor="subject-auto-expand" className="text-sm">Expand aliases with AI</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                One Haiku call on the first refresh, to infer per-word aliases and competitor
                brands. Off by default: a multi-word label benefits, an exact brand name does not,
                and it adds a dependency to the discovery path.
              </p>
            </div>
            <Switch id="subject-auto-expand" checked={autoExpand} onCheckedChange={setAutoExpand} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !label.trim()}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Start tracking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TrackSubjectDialog;
