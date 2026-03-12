import React, { useState, useEffect } from 'react';
import { Plus, Palette, Loader2, Image, Video, Globe } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { moodboardAPI } from '@/services/moodboardAPI';
import type { MoodBoard } from '@/types/materials';

interface AddMediaToMoodboardModalProps {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'vr_world';
  mediaTitle?: string;
  onClose: () => void;
  onSuccess?: (moodboardName: string) => void;
}

const mediaTypeIcon = {
  image: Image,
  video: Video,
  vr_world: Globe,
};

const mediaTypeLabel = {
  image: 'Image',
  video: 'Video',
  vr_world: 'VR World',
};

export const AddMediaToMoodboardModal: React.FC<AddMediaToMoodboardModalProps> = ({
  mediaUrl,
  mediaType,
  mediaTitle,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [moodboards, setMoodboards] = useState<MoodBoard[]>([]);
  const [selectedMoodboardId, setSelectedMoodboardId] = useState<string>('');
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newMoodboardTitle, setNewMoodboardTitle] = useState('');
  const [notes, setNotes] = useState('');

  const TypeIcon = mediaTypeIcon[mediaType];

  useEffect(() => {
    loadMoodboards();
  }, []);

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

  const addToMoodboard = async (moodboardId: string) => {
    await moodboardAPI.addMoodBoardItem({
      moodboard_id: moodboardId,
      material_id: null,
      media_url: mediaUrl,
      media_type: mediaType,
      media_title: mediaTitle,
      notes: notes || undefined,
    });
  };

  const handleAddToExisting = async () => {
    if (!selectedMoodboardId) {
      toast({ title: 'Error', description: 'Please select a moodboard', variant: 'destructive' });
      return;
    }
    try {
      setProcessing(true);
      await addToMoodboard(selectedMoodboardId);
      const selected = moodboards.find(m => m.id === selectedMoodboardId);
      toast({ title: 'Added!', description: `Saved to "${selected?.title}"` });
      onSuccess?.(selected?.title ?? '');
      onClose();
    } catch {
      toast({ title: 'Error', description: 'Failed to add to moodboard', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newMoodboardTitle.trim()) {
      toast({ title: 'Error', description: 'Please enter a moodboard title', variant: 'destructive' });
      return;
    }
    try {
      setProcessing(true);
      const newMoodboard = await moodboardAPI.createMoodBoard({ title: newMoodboardTitle });
      await addToMoodboard(newMoodboard.id);
      toast({ title: 'Added!', description: `Saved to "${newMoodboardTitle}"` });
      onSuccess?.(newMoodboardTitle);
      onClose();
    } catch {
      toast({ title: 'Error', description: 'Failed to create moodboard', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <TypeIcon className="h-5 w-5" />
            Save {mediaTypeLabel[mediaType]} to Moodboard
          </DialogTitle>
          <DialogDescription>
            {mediaTitle || 'Add this generated content to one of your moodboards'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Preview */}
          {mediaType === 'image' && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img src={mediaUrl} alt={mediaTitle} className="w-full h-40 object-cover" />
            </div>
          )}
          {mediaType === 'video' && (
            <video src={mediaUrl} className="w-full h-40 object-cover rounded-lg border border-border" muted />
          )}
          {mediaType === 'vr_world' && (
            <div className="flex items-center gap-3 bg-muted rounded-lg p-3">
              <Globe className="h-8 w-8 text-violet-500" />
              <div>
                <p className="font-medium text-sm">{mediaTitle || 'VR World'}</p>
                <p className="text-xs text-muted-foreground">Interactive 3D environment</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes..."
              className="mt-1"
              rows={2}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
            </div>
          ) : showCreateNew ? (
            <div className="space-y-3">
              <div>
                <Label>Moodboard Title</Label>
                <Input
                  value={newMoodboardTitle}
                  onChange={(e) => setNewMoodboardTitle(e.target.value)}
                  placeholder="e.g., Living Room Inspiration"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowCreateNew(false)} variant="outline" className="flex-1" disabled={processing}>
                  Back
                </Button>
                <Button
                  onClick={handleCreateAndAdd}
                  className="flex-1"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Create & Save
                </Button>
              </div>
            </div>
          ) : moodboards.length === 0 ? (
            <div className="text-center py-8">
              <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground mb-2">No moodboards yet</p>
              <p className="text-muted-foreground text-sm mb-4">Create your first moodboard to start saving content</p>
              <Button onClick={() => setShowCreateNew(true)} style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Moodboard
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Select Moodboard</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {moodboards.map((moodboard) => (
                  <button
                    key={moodboard.id}
                    onClick={() => setSelectedMoodboardId(moodboard.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedMoodboardId === moodboard.id
                        ? 'bg-primary/10 border-primary'
                        : 'bg-muted border-border hover:bg-muted/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{moodboard.title}</p>
                        {moodboard.description && (
                          <p className="text-muted-foreground text-xs truncate">{moodboard.description}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToExisting}
                  className="flex-1"
                  style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
                  disabled={!selectedMoodboardId || processing}
                >
                  {processing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : (
                    <><Palette className="h-4 w-4 mr-2" />Save to Moodboard</>
                  )}
                </Button>
                <Button onClick={() => setShowCreateNew(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  New
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
