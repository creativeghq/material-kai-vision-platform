/**
 * Starter Prompts Modal
 *
 * Admin-curated starter prompts for the chat composer. Loads rows from `prompts`
 * where prompt_type='chat_starter' and category=<agentId>, groups them by
 * `configuration.group`, and (if the picked starter has variables) shows a small
 * variable form before returning the filled text to the parent.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Sparkles, X, ArrowLeft, ArrowRight, ImageIcon, Bot } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  listChatStarters, substituteVariables, groupStarters,
} from '@/services/chatStarters';
import type { ChatStarter } from '@/services/chatStarters';

interface StarterPromptsModalProps {
  agentId:          string;
  isAdmin:          boolean;
  hasUploadedImage: boolean;
  onSubmit:         (promptText: string) => void;
  onClose:          () => void;
}

export function StarterPromptsModal({
  agentId, isAdmin, hasUploadedImage, onSubmit, onClose,
}: StarterPromptsModalProps) {
  const [starters, setStarters] = useState<ChatStarter[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [picked,   setPicked]   = useState<ChatStarter | null>(null);
  const [values,   setValues]   = useState<Record<string, string>>({});

  // ── Load starters for this agent + role ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await listChatStarters(agentId, isAdmin);
      if (!cancelled) {
        setStarters(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, isAdmin]);

  const grouped = useMemo(() => groupStarters(starters), [starters]);

  // Guard: never emit an empty string — that silently disables the chat Send button
  // and looks like "the message disappeared" when the user clicks Send afterwards.
  const safeSubmit = (text: string) => {
    if (!text || !text.trim()) {
      console.warn('[StarterPromptsModal] refusing to submit empty prompt_text');
      return;
    }
    onSubmit(text);
  };

  // When user picks a starter, seed the variable form with defaults
  const handlePick = (starter: ChatStarter) => {
    const vars = starter.configuration?.variables ?? [];

    // No variables → submit immediately without entering the preview step
    if (vars.length === 0) {
      safeSubmit(starter.prompt_text);
      return;
    }

    // Has variables → enter preview/variable-form step
    const seed: Record<string, string> = {};
    vars.forEach(v => { seed[v.key] = v.default ?? ''; });
    setValues(seed);
    setPicked(starter);
  };

  const handleInsert = () => {
    if (!picked) return;
    safeSubmit(substituteVariables(picked.prompt_text, values));
  };

  // ── Variable-form step ──────────────────────────────────────────────────────
  if (picked) {
    const vars = picked.configuration?.variables ?? [];
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-background rounded-2xl shadow-2xl border border-white/20 w-full max-w-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-5 border-b border-border/50">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                onClick={() => setPicked(null)}
                title="Back to picker"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{picked.name}</h3>
                {picked.description && (
                  <p className="text-xs text-muted-foreground truncate">{picked.description}</p>
                )}
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {picked.configuration?.requires_image && !hasUploadedImage && (
              <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5">
                <ImageIcon className="h-4 w-4 shrink-0" />
                <span>This starter works best when you attach a photo first.</span>
              </div>
            )}

            {vars.map(v => (
              <div key={v.key} className="space-y-1.5">
                <Label htmlFor={`var-${v.key}`} className="text-sm font-medium">
                  {v.key}
                  {v.description && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">— {v.description}</span>
                  )}
                </Label>
                <Input
                  id={`var-${v.key}`}
                  value={values[v.key] ?? ''}
                  onChange={(e) => setValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                  placeholder={v.default}
                />
              </div>
            ))}

            {/* Prompt preview */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="text-xs whitespace-pre-wrap bg-muted/50 rounded-lg p-3 border max-h-40 overflow-y-auto">
                {substituteVariables(picked.prompt_text, values)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-border/50 bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {picked.configuration?.skill_hint && (
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {picked.configuration.skill_hint}
                </Badge>
              )}
              {picked.configuration?.credit_estimate && (
                <span>~{picked.configuration.credit_estimate} credits</span>
              )}
            </div>
            <Button onClick={handleInsert} className="rounded-full">
              Insert into chat
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Picker step ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl border border-white/20 w-full max-w-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Starter Prompts</h3>
              <p className="text-xs text-muted-foreground">
                Curated templates that trigger the right skills and produce consistent results.
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading starters…</p>
          ) : starters.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">No starters for this agent yet</p>
              <p className="text-xs text-muted-foreground">
                Admins can add them via the <code>prompts</code> table (prompt_type=chat_starter).
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {group}
                  </h4>
                  <div className="space-y-2">
                    {items.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handlePick(s)}
                        className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors flex items-start gap-3"
                      >
                        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium">{s.name}</span>
                            {s.is_default && (
                              <Badge variant="outline" className="text-[10px]">default</Badge>
                            )}
                            {s.configuration?.visibility === 'admin' && (
                              <Badge variant="outline" className="text-[10px]">admin</Badge>
                            )}
                            {s.configuration?.requires_image && (
                              <Badge variant="outline" className="text-[10px]">
                                <ImageIcon className="h-2.5 w-2.5 mr-0.5" />image
                              </Badge>
                            )}
                            {s.configuration?.skill_hint && (
                              <Badge variant="outline" className="text-[10px]">
                                skill: {s.configuration.skill_hint}
                              </Badge>
                            )}
                            {s.configuration?.credit_estimate && (
                              <span className="text-[10px] text-muted-foreground">
                                ~{s.configuration.credit_estimate} cr
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {s.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
