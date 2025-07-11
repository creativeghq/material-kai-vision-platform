import React, { useState, useEffect } from 'react';
import { Plus, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { moodboardAPI, type CreateMoodBoardData } from '@/services/moodboardAPI';
import type { Material, MoodBoard } from '@/types/materials';

interface AddToBoardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: Material | null;
}

export const AddToBoardModal: React.FC<AddToBoardModalProps> = ({
  open,
  onOpenChange,
  material
}) => {
  const [moodboards, setMoodboards] = useState<MoodBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadMoodBoards();
    }
  }, [open]);

  const loadMoodBoards = async () => {
    setLoading(true);
    try {
      const boards = await moodboardAPI.getUserMoodBoards();
      setMoodboards(boards);
    } catch (error) {
      console.error('Error loading moodboards:', error);
      toast({
        title: "Error",
        description: "Failed to load your moodboards",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToExistingBoard = async () => {
    if (!material || !selectedBoardId) return;

    setAdding(true);
    try {
      await moodboardAPI.addMoodBoardItem({
        moodboard_id: selectedBoardId,
        material_id: material.id
      });

      const selectedBoard = moodboards.find(b => b.id === selectedBoardId);
      toast({
        title: "Success",
        description: `Added "${material.name}" to "${selectedBoard?.title}"`
      });
      onOpenChange(false);
      resetState();
    } catch (error: any) {
      console.error('Error adding to board:', error);
      const errorMessage = error.message?.includes('duplicate') 
        ? 'This material is already in the selected moodboard'
        : 'Failed to add material to moodboard';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setAdding(false);
    }
  };

  const handleCreateNewBoard = async () => {
    if (!material || !newBoardTitle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title for the new moodboard",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      // Create new board
      const newBoard = await moodboardAPI.createMoodBoard({
        title: newBoardTitle.trim(),
        is_public: false
      });

      // Add material to the new board
      await moodboardAPI.addMoodBoardItem({
        moodboard_id: newBoard.id,
        material_id: material.id
      });

      toast({
        title: "Success",
        description: `Created "${newBoard.title}" and added "${material.name}"`
      });
      onOpenChange(false);
      resetState();
    } catch (error) {
      console.error('Error creating board and adding material:', error);
      toast({
        title: "Error",
        description: "Failed to create new moodboard",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const resetState = () => {
    setSelectedBoardId('');
    setShowCreateNew(false);
    setNewBoardTitle('');
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to MoodBoard</DialogTitle>
        </DialogHeader>

        {/* Material Preview */}
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          {material.thumbnail_url && (
            <img 
              src={material.thumbnail_url} 
              alt={material.name}
              className="w-12 h-12 rounded object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{material.name}</h4>
            <Badge variant="outline" className="text-xs">
              {material.category}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          {/* Add to Existing Board */}
          {!showCreateNew && (
            <div className="space-y-3">
              <Label>Select a MoodBoard</Label>
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">
                  Loading your moodboards...
                </div>
              ) : moodboards.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No moodboards found. Create your first one below!
                </div>
              ) : (
                <>
                  <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a moodboard..." />
                    </SelectTrigger>
                    <SelectContent>
                      {moodboards.map(board => (
                        <SelectItem key={board.id} value={board.id}>
                          <div className="flex items-center gap-2">
                            <span>{board.title}</span>
                            {board.isPublic && (
                              <Badge variant="secondary" className="text-xs">Public</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button 
                    onClick={handleAddToExistingBoard}
                    disabled={!selectedBoardId || adding}
                    className="w-full"
                  >
                    {adding ? (
                      <>Adding...</>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Add to Selected MoodBoard
                      </>
                    )}
                  </Button>
                </>
              )}

              <div className="flex items-center gap-2">
                <Separator className="flex-1" />
                <span className="text-sm text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>

              <Button 
                variant="outline" 
                onClick={() => setShowCreateNew(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New MoodBoard
              </Button>
            </div>
          )}

          {/* Create New Board */}
          {showCreateNew && (
            <div className="space-y-3">
              <Label htmlFor="newBoardTitle">New MoodBoard Title</Label>
              <Input
                id="newBoardTitle"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder="Enter moodboard title..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateNewBoard();
                  }
                }}
              />

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateNew(false)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleCreateNewBoard}
                  disabled={!newBoardTitle.trim() || creating}
                  className="flex-1"
                >
                  {creating ? 'Creating...' : 'Create & Add'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};