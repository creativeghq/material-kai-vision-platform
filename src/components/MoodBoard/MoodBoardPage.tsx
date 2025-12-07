import { useState, useEffect, useCallback } from 'react';
import { Plus, Palette, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  moodboardAPI,
  type CreateMoodBoardData,
} from '@/services/moodboardAPI';
import type { MoodBoard } from '@/types/materials';
import { quotesService } from '@/services/quotes/QuotesService';
import { useNavigate } from 'react-router-dom';
import { DashboardCard } from '@/components/DesignSystem/DashboardCard';

export const MoodBoardPage = () => {
  const [moodboards, setMoodboards] = useState<MoodBoard[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

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
      setMoodboards((prev) => [board, ...prev]);
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

  const handleCreateProposal = async (moodboardId: string, moodboardTitle: string) => {
    const moodboard = moodboards.find(b => b.id === moodboardId);
    if (!moodboard || !moodboard.items || moodboard.items.length === 0) {
      toast({
        title: 'Error',
        description: 'Cannot create proposal from empty moodboard',
        variant: 'destructive',
      });
      return;
    }

    setCreatingProposal(moodboardId);
    try {
      // Create a new quote
      const quote = await quotesService.createQuote({
        name: `Proposal from ${moodboardTitle}`,
        notes: `Created from moodboard: ${moodboardTitle}`,
      });

      // Add all moodboard items to the quote
      for (const item of moodboard.items) {
        if (item.material_id) {
          await quotesService.addItem({
            quote_id: quote.id,
            product_id: item.material_id,
            quantity: 1,
            notes: item.notes || '',
            added_from: 'moodboard',
          });
        }
      }

      toast({
        title: 'Proposal Created',
        description: `Quote created with ${moodboard.items.length} items from "${moodboardTitle}"`,
      });

      // Navigate to the quote builder
      navigate(`/quotes?quote=${quote.id}`);
    } catch (error) {
      console.error('Error creating proposal:', error);
      toast({
        title: 'Error',
        description: 'Failed to create proposal from moodboard',
        variant: 'destructive',
      });
    } finally {
      setCreatingProposal(null);
    }
  };

  const handleDeleteMoodBoard = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      await moodboardAPI.deleteMoodBoard(id);
      setMoodboards((prev) => prev.filter((board) => board.id !== id));
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
          <p className="mt-2 text-muted-foreground">
            Loading your moodboards...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="bg-card py-6">
        <div className="page-container">
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
          <Button
            onClick={() => setShowCreateDialog(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setShowCreateDialog(true);
              }
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New MoodBoard
          </Button>
          </div>
        </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container py-6">
        {moodboards.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No MoodBoards Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first moodboard to start organizing materials
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowCreateDialog(true);
                }
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Your First MoodBoard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
              : 'space-y-4'
          }
        >
          {moodboards.map((board) => (
            <DashboardCard
              key={board.id}
              className={`group cursor-pointer ${
                viewMode === 'list' ? 'flex flex-row' : ''
              }`}
              hover={true}
            >
              <div
                className={viewMode === 'list' ? 'flex-1' : ''}
                onClick={() => navigate(`/moodboard/${board.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate(`/moodboard/${board.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
              >
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
                        <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                          Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                          Private
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{board.items?.length || 0} materials</span>
                    <span>
                      {new Date(board.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateProposal(board.id, board.title);
                      }}
                      disabled={!board.items || board.items.length === 0 || creatingProposal === board.id}
                      style={{
                        backgroundColor: 'hsl(var(--primary))',
                        color: 'white'
                      }}
                    >
                      {creatingProposal === board.id ? (
                        <>Creating...</>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Create Proposal
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMoodBoard(board.id, board.title);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          handleDeleteMoodBoard(board.id, board.title);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}
      </div>

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
                onChange={(e) =>
                  setNewMoodBoard((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                placeholder="Enter moodboard title..."
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newMoodBoard.description}
                onChange={(e) =>
                  setNewMoodBoard((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe your moodboard..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="public"
                checked={newMoodBoard.is_public}
                onCheckedChange={(checked: boolean) =>
                  setNewMoodBoard((prev) => ({
                    ...prev,
                    is_public: checked,
                  }))
                }
              />
              <Label htmlFor="public">Make this moodboard public</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => setShowCreateDialog(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setShowCreateDialog(false);
                  }
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateMoodBoard}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateMoodBoard();
                  }
                }}
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
