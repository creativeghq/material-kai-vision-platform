import React, { useState } from 'react';
import { Globe, X, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';

interface InspirationUrlModalProps {
  onSubmit: (url: string, focus: string) => void;
  onClose: () => void;
}

const FOCUS_OPTIONS = [
  { value: 'all', label: 'All Surfaces' },
  { value: 'floor', label: 'Floors' },
  { value: 'wall', label: 'Walls' },
  { value: 'countertop', label: 'Countertops' },
  { value: 'ceiling', label: 'Ceiling' },
  { value: 'furniture', label: 'Furniture' },
] as const;

export function InspirationUrlModal({ onSubmit, onClose }: InspirationUrlModalProps) {
  const [url, setUrl] = useState('');
  const [focus, setFocus] = useState('all');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!url.trim()) {
      setError('Please paste a URL');
      return;
    }
    try {
      new URL(url.trim());
    } catch {
      setError('Please enter a valid URL');
      return;
    }
    setError('');
    onSubmit(url.trim(), focus);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl border border-white/20 w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-medium text-base">Design Inspiration Finder</h2>
              <p className="text-xs text-muted-foreground">Paste a URL and find matching materials</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">URL</label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(''); }}
              placeholder="https://www.houzz.com/photos/modern-bathroom..."
              className="h-11"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Focus Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Focus on</label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFocus(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    focus === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:border-primary/50 hover:bg-muted/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Supported sites hint */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-accent/30 border border-accent/50">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Works with Houzz, Pinterest, Dezeen, ArchDaily, manufacturer sites, or any page with room and material images.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-5 pt-0">
          <Button
            onClick={handleSubmit}
            disabled={!url.trim()}
            className="gap-2 rounded-full"
          >
            Find Materials
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
