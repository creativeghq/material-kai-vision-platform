/** Subject options, preview text and a body outline in a chosen website's brand voice — generate-email-copy, which spends credits. */
import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField, FormSection } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService, type UserWebsite } from '@/services/userWebsitesService';
import { marketingService, type EmailCopyDraft } from '../services/marketingService';

export const EmailCopyAssist: React.FC<{
  workspaceId: string;
  subject: string;
  onPick: (subject: string, preview?: string | null) => void;
}> = ({ workspaceId, subject, onPick }) => {
  const { toast } = useToast();
  const [websites, setWebsites] = useState<UserWebsite[]>([]);
  const [ai, setAi] = useState({ brief: '', audience: '', website_id: '' });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDraft, setAiDraft] = useState<EmailCopyDraft | null>(null);

  useEffect(() => {
    userWebsitesService.list(workspaceId).then((w) => setWebsites(w.filter((x) => x.is_active))).catch(() => setWebsites([]));
  }, [workspaceId]);

  const writeWithAi = async () => {
    if (!ai.brief.trim()) { toast({ title: 'Say what the email is about first', variant: 'destructive' }); return; }
    setAiBusy(true);
    try {
      const draft = await marketingService.writeCopy(workspaceId, { brief: ai.brief, audience: ai.audience, website_id: ai.website_id || null });
      setAiDraft(draft);
      onPick(draft.subjects[0]?.text ?? subject, draft.preview_text.text);
    } catch (e: unknown) {
      toast({ title: 'Could not write the copy', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <FormSection title="Write with AI" description="Subject options, preview text and a body outline, written in the chosen website's brand voice and checked against the email writing rules. Uses credits.">
      <FormField label="What Is This Email About?" htmlFor="c-ai-brief">
        <Textarea id="c-ai-brief" rows={2} value={ai.brief} onChange={(e) => setAi({ ...ai, brief: e.target.value })}
          placeholder="New large-format porcelain range in stock; invite architects to the showroom." />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Audience" htmlFor="c-ai-aud" optional>
          <Input id="c-ai-aud" value={ai.audience} onChange={(e) => setAi({ ...ai, audience: e.target.value })} placeholder="Architects and contractors" />
        </FormField>
        <FormField label="Voice" htmlFor="c-ai-voice" hint="Set in each website's Brand Profile.">
          <Select value={ai.website_id || 'default'} onValueChange={(v) => setAi({ ...ai, website_id: v === 'default' ? '' : v })}>
            <SelectTrigger id="c-ai-voice"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Workspace Default</SelectItem>
              {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.display_name || w.url}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <Button variant="outline" onClick={() => void writeWithAi()} disabled={aiBusy}>
        {aiBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
        {aiDraft ? 'Write again' : 'Write copy'}
      </Button>
      {aiDraft && (
        <div className="space-y-3 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold">Subject Options</p>
            {aiDraft.subjects.map((x, i) => (
              <button key={i} type="button"
                className={`block w-full rounded-sm border bg-card px-2 py-1.5 text-left ${subject === x.text ? 'border-primary' : 'border-hairline'}`}
                onClick={() => onPick(x.text)}>
                <span>{x.text}</span>
                <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">{x.char_count} chars · {x.angle}</span>
                {x.warnings.map((w) => <span key={w.code} className="block text-[11px] text-muted-foreground">{w.message}</span>)}
              </button>
            ))}
          </div>
          {aiDraft.preview_text.warnings.map((w) => <p key={w.code} className="text-[11px] text-muted-foreground">Preview text: {w.message}</p>)}
          <div className="space-y-1">
            <p className="text-xs font-semibold">Body Outline</p>
            <p className="font-medium">{aiDraft.body.headline}</p>
            <p>{aiDraft.body.opening}</p>
            <ul className="list-disc pl-5">{aiDraft.body.points.map((pt, i) => <li key={i}>{pt}</li>)}</ul>
            <p>Button: {aiDraft.body.cta_text}</p>
            {aiDraft.body.ps && <p className="text-muted-foreground">P.S. {aiDraft.body.ps}</p>}
            <p className="text-[11px] text-muted-foreground">Put the body into your template; the subject and preview text above are filled in for you.</p>
          </div>
          {[...aiDraft.body_warnings, ...aiDraft.avoid_hits.map((h) => ({ code: `avoid-${h}`, message: `Uses "${h}", which is on your Words to Avoid list.` }))]
            .map((w) => <p key={w.code} className="text-[11px] text-muted-foreground">{w.message}</p>)}
        </div>
      )}
    </FormSection>
  );
};

export default EmailCopyAssist;
