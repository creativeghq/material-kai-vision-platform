import { useState, useEffect, useCallback } from 'react';
import { Plus, Palette, FileText, Trash2, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  moodboardAPI,
  type CreateMoodBoardData,
} from '@/services/moodboardAPI';
import type { MoodBoard } from '@/types/materials';
import { quotesService } from '@/services/quotes/QuotesService';
import { useNavigate } from 'react-router-dom';
import { DashboardCard } from '@/components/core/DesignSystem/DashboardCard';
import { PageHeader } from '@/components/shared/PageHeader';

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
    <div>
      <PageHeader
        icon={Palette}
        title="MoodBoards"
        subtitle="Organize and curate your favorite materials"
        actions={
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/20"
          >
            <Plus className="h-4 w-4 mr-2" />
            New MoodBoard
          </Button>
        }
      />

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
              className="cursor-pointer overflow-hidden p-0"
              hover={true}
            >
              {/* Material Preview Grid */}
              <div
                className="h-36 grid grid-cols-2 grid-rows-2 gap-px bg-border overflow-hidden"
                onClick={() => navigate(`/moodboard/${board.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/moodboard/${board.id}`); }}
              >
                {(() => {
                  const previews = (board.items || []).filter(i => i.material?.thumbnail_url).slice(0, 4);
                  if (previews.length === 0) {
                    return (
                      <div className="col-span-2 row-span-2 flex items-center justify-center bg-gradient-to-br from-primary/10 to-muted">
                        <Palette className="h-10 w-10 text-primary/30" />
                      </div>
                    );
                  }
                  return previews.map((item, idx) => (
                    <div key={item.id} className={`overflow-hidden bg-muted ${previews.length === 1 ? 'col-span-2 row-span-2' : previews.length === 2 ? 'row-span-2' : ''}`}>
                      <img
                        src={item.material!.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ));
                })()}
              </div>

              {/* Card Body */}
              <div
                className="p-4 pb-2"
                onClick={() => navigate(`/moodboard/${board.id}`)}
                role="button"
                tabIndex={-1}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/moodboard/${board.id}`); }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm truncate flex-1">{board.title}</h3>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                    board.isPublic
                      ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                      : 'bg-muted border-border text-muted-foreground'
                  }`}>
                    {board.isPublic ? 'Public' : 'Private'}
                  </span>
                </div>
                {board.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{board.description}</p>
                )}
                <p className="text-xs text-muted-foreground">{board.items?.length || 0} materials</p>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {new Date(board.createdAt).toLocaleDateString()}
                </span>
                <TooltipProvider>
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateProposal(board.id, board.title);
                          }}
                          disabled={!board.items || board.items.length === 0 || creatingProposal === board.id}
                        >
                          {creatingProposal === board.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <FileText className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Create Proposal</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMoodBoard(board.id, board.title);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Delete</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
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
