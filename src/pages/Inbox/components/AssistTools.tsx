import React, { useState } from 'react';
import { Check, Copy, ListChecks, Loader2, MessageCircleQuestion, Sparkles, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';

export type CopilotMode = 'summary' | 'actions' | 'ask';
export type RewriteMode = 'rewrite' | 'shorten' | 'formal';

/** JARVIS on the open conversation: a summary, the action items, or an answer to a question. */
export const CopilotPanel: React.FC<{ run: (mode: CopilotMode, question?: string) => Promise<string> }> = ({ run }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<CopilotMode | null>(null);
  const [result, setResult] = useState<{ mode: CopilotMode; text: string } | null>(null);
  const [question, setQuestion] = useState('');
  const [copied, setCopied] = useState(false);

  const go = async (mode: CopilotMode) => {
    setBusy(mode);
    try {
      setResult({ mode, text: await run(mode, mode === 'ask' ? question.trim() : undefined) });
    } catch (e) {
      toast({ title: 'JARVIS could not answer', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const titles: Record<CopilotMode, string> = { summary: 'Summary', actions: 'Action items', ask: 'Answer' };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busy} onClick={() => { void go('summary'); }}>
          {busy === 'summary' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}Summarise
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busy} onClick={() => { void go('actions'); }}>
          {busy === 'actions' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5 mr-1" />}Action items
        </Button>
      </div>
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (question.trim()) void go('ask'); }}>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this conversation…" className="h-8 text-xs" aria-label="Question for JARVIS" />
        <Button type="submit" size="sm" className="h-8 text-xs shrink-0" disabled={!!busy || !question.trim()}>
          {busy === 'ask' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircleQuestion className="w-3.5 h-3.5" />}
        </Button>
      </form>
      {result && (
        <div className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Sparkles className="w-3.5 h-3.5" />{titles[result.mode]} by JARVIS
            <button type="button" className="ml-auto hover:text-foreground" title="Copy"
              onClick={() => { void navigator.clipboard.writeText(result.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="whitespace-pre-wrap">{result.text}</div>
        </div>
      )}
    </div>
  );
};

/** Rewrite, shorten or formalise what is in the composer, in place. */
export const RewriteMenu: React.FC<{ text: string; onReplace: (text: string) => void; run: (mode: RewriteMode, text: string) => Promise<string>; disabled?: boolean }> = ({ text, onReplace, run, disabled }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (mode: RewriteMode) => {
    setBusy(true);
    try {
      onReplace(await run(mode, text));
    } catch (e) {
      toast({ title: 'Could not rewrite', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" disabled={disabled || busy || !text.trim()} title="Improve what you wrote with JARVIS">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}Improve
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => { void go('rewrite'); }}>Rewrite clearly</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void go('shorten'); }}>Make it shorter</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void go('formal'); }}>Make it formal</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
