import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Grid3X3, List, Palette } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { moodboardAPI, type CreateMoodBoardData } from '@/services/moodboardAPI';
import type { MoodBoard } from '@/types/materials';

export const MoodBoardPage = () => {
  const [moodboards, setMoodboards] = useState<MoodBoard[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const [newMoodBoard, setNewMoodBoard] = useState<CreateMoodBoardData>({
    title: '',
    description: '',
    is_public: false,
    view_preference: 'grid',
  });

  const loadMoodBoards = useCallback(async () => {
    try {
      const boards = await moodboardAPI.getUserMoodBoards();
      setMoodboards(boards);
    } catch (error) {
      console.error('Error loading moodboards:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your moodboards',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMoodBoards();
  }, [loadMoodBoards]);

  const handleCreateMoodBoard = async () => {
    if (!newMoodBoard.title.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a title for your moodboard',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const board = await moodboardAPI.createMoodBoard(newMoodBoard);
      setMoodboards(prev => [board, ...prev]);
      setShowCreateDialog(false);
      setNewMoodBoard({
        title: '',
        description: '',
        is_public: false,
        view_preference: 'grid',
      });
      toast({
        title: 'Success',
        description: `MoodBoard "${board.title}" created successfully`,
      });
    } catch (error) {
      console.error('Error creating moodboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to create moodboard',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteMoodBoard = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      await moodboardAPI.deleteMoodBoard(id);
      setMoodboards(prev => prev.filter(board => board.id !== id));
      toast({
        title: 'Success',
        description: `MoodBoard "${title}" deleted successfully`,
      });
    } catch (error) {
      console.error('Error deleting moodboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete moodboard',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading your moodboards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Palette className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">MoodBoards</h1>
            <p className="text-muted-foreground">
              Organize and curate your favorite materials
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New MoodBoard
          </Button>
        </div>
      </div>

      {/* MoodBoards Grid */}
      {moodboards.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No MoodBoards Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first moodboard to start organizing materials
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First MoodBoard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
            : 'space-y-4'
        }>
          {moodboards.map((board) => (
            <Card
              key={board.id}
              className={`group hover:shadow-lg transition-all cursor-pointer ${
                viewMode === 'list' ? 'flex flex-row' : ''
              }`}
            >
              <div className={viewMode === 'list' ? 'flex-1' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="truncate">{board.title}</CardTitle>
                      {board.description && (
                        <CardDescription className="mt-1 line-clamp-2">
                          {board.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2">
                      {board.isPublic ? (
                        <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">Public</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-semibold text-gray-700">Private</span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{board.items?.length || 0} materials</span>
                    <span>{new Date(board.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button className="flex-1">
                      Open
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMoodBoard(board.id, board.title);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create MoodBoard Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New MoodBoard</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newMoodBoard.title}
                onChange={(e) => setNewMoodBoard(prev => ({
                  ...prev,
                  title: e.target.value,
                }))}
                placeholder="Enter moodboard title..."
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newMoodBoard.description}
                onChange={(e) => setNewMoodBoard(prev => ({
                  ...prev,
                  description: e.target.value,
                }))}
                placeholder="Describe your moodboard..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="public"
                checked={newMoodBoard.is_public}
                onCheckedChange={(checked: boolean) => setNewMoodBoard(prev => ({
                  ...prev,
                  is_public: checked,
                }))}
              />
              <Label htmlFor="public">Make this moodboard public</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => setShowCreateDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateMoodBoard}
                disabled={creating}
                className="flex-1"
              >
                {creating ? 'Creating...' : 'Create MoodBoard'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
