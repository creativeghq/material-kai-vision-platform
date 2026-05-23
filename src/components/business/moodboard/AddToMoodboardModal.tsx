import React, { useState, useEffect } from 'react';
import { Plus, Palette, Loader2 } from 'lucide-react';

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
import { ProjectPickerInline } from '@/modules/projects/components/ProjectPickerInline';

interface AddToMoodboardModalProps {
  productId: string;
  productName?: string;
  productImage?: string;
  onClose: () => void;
  onSuccess: (moodboardName: string) => void;
}

export const AddToMoodboardModal: React.FC<AddToMoodboardModalProps> = ({
  productId,
  productName,
  productImage,
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
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [newRoomId, setNewRoomId] = useState<string | null>(null);

  useEffect(() => {
    loadMoodboards();
  }, []);

  const loadMoodboards = async () => {
    try {
      setLoading(true);
      const data = await moodboardAPI.getUserMoodBoards();
      setMoodboards(data || []);
    } catch (error) {
      console.error('Error loading moodboards:', error);
      toast({
        title: 'Error',
        description: 'Failed to load moodboards',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isValidUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const handleAddToExisting = async () => {
    if (!selectedMoodboardId) {
      toast({
        title: 'Error',
        description: 'Please select a moodboard',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidUUID(productId)) {
      toast({
        title: 'Cannot Add Product',
        description: 'Demo products cannot be added to moodboards',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      await moodboardAPI.addMoodBoardItem({
        moodboard_id: selectedMoodboardId,
        material_id: productId,
        notes,
      });

      const selectedMoodboard = moodboards.find(m => m.id === selectedMoodboardId);
      onSuccess(selectedMoodboard?.title || `Moodboard #${selectedMoodboardId.substring(0, 8)}`);
      onClose();
    } catch (error) {
      console.error('Error adding to moodboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to add product to moodboard',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newMoodboardTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a moodboard title',
        variant: 'destructive',
      });
      return;
    }

    if (!isValidUUID(productId)) {
      toast({
        title: 'Cannot Add Product',
        description: 'Demo products cannot be added to moodboards',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      // Create new moodboard
      const newMoodboard = await moodboardAPI.createMoodBoard({
        title: newMoodboardTitle,
        project_id: newProjectId,
        room_id: newRoomId,
      });

      // Add product to the new moodboard
      await moodboardAPI.addMoodBoardItem({
        moodboard_id: newMoodboard.id,
        material_id: productId,
        notes,
      });

      onSuccess(newMoodboardTitle);
      onClose();
    } catch (error) {
      console.error('Error creating moodboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to create moodboard',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Add to Moodboard</DialogTitle>
          <DialogDescription>
            {productName || 'Select a moodboard or create a new one'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Product Info */}
          {productImage && (
            <div className="flex items-center gap-3 bg-muted rounded-lg p-3">
              <img
                src={productImage}
                alt={productName}
                className="w-16 h-16 object-cover rounded"
              />
              <div className="flex-1">
                <p className="font-medium">{productName}</p>
                <p className="text-muted-foreground text-sm">ID: {productId.substring(0, 8)}...</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this material..."
              className="mt-1"
              rows={2}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
            </div>
          ) : showCreateNew ? (
            /* Create New Moodboard Form */
            <div className="space-y-3">
              <div>
                <Label>Moodboard Title</Label>
                <Input
                  value={newMoodboardTitle}
                  onChange={(e) => setNewMoodboardTitle(e.target.value)}
                  placeholder="e.g., Living Room Inspiration"
                  className="mt-1"
                />
              </div>
              <ProjectPickerInline
                projectId={newProjectId}
                roomId={newRoomId}
                onChange={({ project_id, room_id }) => {
                  setNewProjectId(project_id);
                  setNewRoomId(room_id);
                }}
                disabled={processing}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCreateNew(false)}
                  variant="outline"
                  className="flex-1"
                  disabled={processing}
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateAndAdd}
                  className="flex-1"
                  style={{
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'white',
                  }}
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create & Add
                </Button>
              </div>
            </div>
          ) : moodboards.length === 0 ? (
            /* No Moodboards Available */
            <div className="text-center py-8">
              <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground mb-2">No moodboards yet</p>
              <p className="text-muted-foreground text-sm mb-4">
                Create your first moodboard to start organizing materials
              </p>
              <Button
                onClick={() => setShowCreateNew(true)}
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'white',
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Moodboard
              </Button>
            </div>
          ) : (
            /* Select Existing Moodboard */
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
                      <Palette className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                      <div className="flex-1">
                        <p className="font-medium">
                          {moodboard.title}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {moodboard.description || 'No description'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToExisting}
                  className="flex-1"
                  style={{
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'white',
                  }}
                  disabled={!selectedMoodboardId || processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Palette className="h-4 w-4 mr-2" />
                      Add to Selected
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowCreateNew(true)}
                  variant="outline"
                >
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


