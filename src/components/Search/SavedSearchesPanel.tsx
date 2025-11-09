import { useState, useEffect } from 'react';
import {
  Search,
  Trash2,
  Share2,
  Play,
  Star,
  Clock,
  Tag,
  Users,
  Globe,
  Lock,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { savedSearchesService, SavedSearch } from '@/services/savedSearchesService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SavedSearchesPanelProps {
  onLoadSearch?: (search: SavedSearch) => void;
  onExecuteSearch?: (search: SavedSearch) => void;
  compact?: boolean;
}

export const SavedSearchesPanel = ({
  onLoadSearch,
  onExecuteSearch,
  compact = false,
}: SavedSearchesPanelProps) => {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchToDelete, setSearchToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSearches = async () => {
    try {
      setLoading(true);
      const data = await savedSearchesService.getUserSavedSearches({
        sortBy: 'last_used_at',
        sortOrder: 'desc',
      });
      setSearches(data);
    } catch (error) {
      console.error('Error loading saved searches:', error);
      toast({
        title: 'Error',
        description: 'Failed to load saved searches',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSearches();
  }, []);

  const handleExecute = async (search: SavedSearch) => {
    try {
      await savedSearchesService.executeSavedSearch(search.id);
      
      if (onExecuteSearch) {
        onExecuteSearch(search);
      }

      toast({
        title: 'Search Executed',
        description: `Running search: ${search.name}`,
      });

      // Reload to update use_count
      await loadSearches();
    } catch (error) {
      console.error('Error executing search:', error);
      toast({
        title: 'Error',
        description: 'Failed to execute search',
        variant: 'destructive',
      });
    }
  };

  const handleLoad = (search: SavedSearch) => {
    if (onLoadSearch) {
      onLoadSearch(search);
    }
    toast({
      title: 'Search Loaded',
      description: `Loaded search: ${search.name}`,
    });
  };

  const handleDelete = async () => {
    if (!searchToDelete) return;

    try {
      await savedSearchesService.deleteSavedSearch(searchToDelete);
      toast({
        title: 'Success',
        description: 'Saved search deleted',
      });
      await loadSearches();
    } catch (error) {
      console.error('Error deleting search:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete search',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setSearchToDelete(null);
    }
  };

  const confirmDelete = (searchId: string) => {
    setSearchToDelete(searchId);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (searches.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No saved searches yet</p>
            <p className="text-sm mt-2">Save your favorite searches for quick access</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Saved Searches
          </CardTitle>
          <CardDescription>
            {searches.length} saved {searches.length === 1 ? 'search' : 'searches'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {searches.map((search) => (
              <div
                key={search.id}
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold truncate">{search.name}</h4>
                      {search.is_public ? (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      {search.relevance_score >= 0.7 && (
                        <Badge variant="secondary" className="text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Hot
                        </Badge>
                      )}
                    </div>

                    {/* Query */}
                    <p className="text-sm text-muted-foreground mb-2 truncate">
                      {search.query}
                    </p>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Play className="h-3 w-3" />
                        {search.use_count} uses
                      </span>
                      {search.last_used_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(search.last_used_at).toLocaleDateString()}
                        </span>
                      )}
                      {search.shared_with_users.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Shared with {search.shared_with_users.length}
                        </span>
                      )}
                      {search.is_active_for_recommendations && (
                        <Badge variant="outline" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {search.recommendation_frequency}
                        </Badge>
                      )}
                    </div>

                    {/* Tags */}
                    {search.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {search.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoad(search)}
                      title="Load search parameters"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExecute(search)}
                      title="Execute search"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {}}
                      title="Share search"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirmDelete(search.id)}
                      title="Delete search"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Search?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the saved search.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

