import React, { useState, useEffect } from 'react';
import { BookmarkPlus, Loader2, Plus, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { moodboardAPI } from '@/services/moodboardAPI';
import type { MoodBoard } from '@/types/materials';

interface MoodboardSavePopoverProps {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'vr_world';
  mediaTitle?: string;
  /** Custom trigger element. Defaults to a rose pill button. */
  children?: React.ReactNode;
  className?: string;
}

export const MoodboardSavePopover: React.FC<MoodboardSavePopoverProps> = ({
  mediaUrl,
  mediaType,
  mediaTitle,
  children,
  className,
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // moodboard id being saved
  const [moodboards, setMoodboards] = useState<MoodBoard[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) loadMoodboards();
  }, [open]);

  const loadMoodboards = async () => {
    try {
      setLoading(true);
      const data = await moodboardAPI.getUserMoodBoards();
      setMoodboards(data || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load moodboards', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (moodboard: MoodBoard) => {
    try {
      setSaving(moodboard.id);
      await moodboardAPI.addMediaFromChat({
        moodboard_id: moodboard.id,
        source_url: mediaUrl,
        media_type: mediaType,
        media_title: mediaTitle,
      });
      toast({ title: 'Saved!', description: `Added to "${moodboard.title}"` });
      setOpen(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to save to moodboard', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      const newMoodboard = await moodboardAPI.createMoodBoard({ title: newTitle.trim() });
      await moodboardAPI.addMediaFromChat({
        moodboard_id: newMoodboard.id,
        source_url: mediaUrl,
        media_type: mediaType,
        media_title: mediaTitle,
      });
      toast({ title: 'Saved!', description: `Created "${newTitle.trim()}" and saved` });
      setOpen(false);
      setNewTitle('');
      setShowCreate(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to create moodboard', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-full text-xs font-medium text-rose-700 transition-colors ${className ?? ''}`}
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save to Moodboard
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <p className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">Save to moodboard</p>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {moodboards.length === 0 && !showCreate && (
              <p className="text-xs text-muted-foreground text-center py-3">No moodboards yet</p>
            )}
            {moodboards.map((mb) => (
              <button
                key={mb.id}
                onClick={() => handleSave(mb)}
                disabled={saving === mb.id}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-sm transition-colors disabled:opacity-60"
              >
                <span className="truncate text-left">{mb.title}</span>
                {saving === mb.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  : <Check className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100" />
                }
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border mt-2 pt-2">
          {showCreate ? (
            <div className="flex gap-1.5">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="New moodboard name..."
                className="h-7 text-xs"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="h-7 px-2 text-xs"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-accent text-xs text-muted-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New moodboard
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
