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
  Bell,
  BellOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';

// Type for saved search records
interface SavedSearch {
  id: string;
  name: string;
  query: string;
  search_strategy: string;
  material_filters?: Record<string, unknown>;
  is_public: boolean;
  tags: string[];
  use_count: number;
  last_used_at?: string;
  shared_with_users: string[];
  is_active_for_recommendations: boolean;
  recommendation_frequency: 'daily' | 'weekly' | 'never';
  relevance_score: number;
}

const savedSearchesService = {
  getUserSavedSearches: async (_options: {
    sortBy: string;
    sortOrder: string;
  }): Promise<SavedSearch[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return [];
    const { data, error } = await supabase
      .from('saved_searches')
      .select('id, name, query, search_strategy, material_filters, is_public, tags, use_count, last_used_at, shared_with_users, is_active_for_recommendations, recommendation_frequency, relevance_score')
      .eq('user_id', session.user.id)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SavedSearch[];
  },

  deleteSavedSearch: async (id: string): Promise<void> => {
    const { error } = await supabase.from('saved_searches').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  executeSavedSearch: async (id: string): Promise<void> => {
    const { data: existing, error: fetchErr } = await supabase
      .from('saved_searches')
      .select('use_count')
      .eq('id', id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    const { error } = await supabase
      .from('saved_searches')
      .update({
        use_count: (existing?.use_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  toggleAlerts: async (id: string, active: boolean): Promise<void> => {
    const { error } = await supabase
      .from('saved_searches')
      .update({ is_active_for_recommendations: active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  setFrequency: async (id: string, frequency: 'daily' | 'weekly' | 'never'): Promise<void> => {
    const { error } = await supabase
      .from('saved_searches')
      .update({ recommendation_frequency: frequency, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};

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

  const handleToggleAlerts = async (search: SavedSearch) => {
    const newActive = !search.is_active_for_recommendations;
    try {
      await savedSearchesService.toggleAlerts(search.id, newActive);
      setSearches((prev) =>
        prev.map((s) =>
          s.id === search.id ? { ...s, is_active_for_recommendations: newActive } : s,
        ),
      );
      toast({
        title: newActive ? 'Alerts Enabled' : 'Alerts Disabled',
        description: newActive
          ? `You'll be notified when new materials match "${search.name}"`
          : `Alerts turned off for "${search.name}"`,
      });
    } catch (error) {
      console.error('Error toggling alerts:', error);
      toast({ title: 'Error', description: 'Failed to update alert settings', variant: 'destructive' });
    }
  };

  const handleFrequencyChange = async (search: SavedSearch, frequency: 'daily' | 'weekly' | 'never') => {
    try {
      await savedSearchesService.setFrequency(search.id, frequency);
      setSearches((prev) =>
        prev.map((s) =>
          s.id === search.id ? { ...s, recommendation_frequency: frequency } : s,
        ),
      );
      toast({ title: 'Frequency Updated', description: `Alert frequency set to ${frequency}` });
    } catch (error) {
      console.error('Error setting frequency:', error);
      toast({ title: 'Error', description: 'Failed to update frequency', variant: 'destructive' });
    }
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

                    {/* Alert frequency picker — visible when alerts active */}
                    {search.is_active_for_recommendations && (
                      <div className="flex items-center gap-2 mt-2">
                        <Bell className="h-3 w-3 text-primary" />
                        <span className="text-xs text-muted-foreground">Notify:</span>
                        <Select
                          value={search.recommendation_frequency}
                          onValueChange={(v) =>
                            handleFrequencyChange(search, v as 'daily' | 'weekly' | 'never')
                          }
                        >
                          <SelectTrigger className="h-6 w-24 text-xs px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="never">Never</SelectItem>
                          </SelectContent>
                        </Select>
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
                      onClick={() => handleToggleAlerts(search)}
                      title={search.is_active_for_recommendations ? 'Disable alerts' : 'Enable alerts'}
                      className={search.is_active_for_recommendations ? 'text-primary' : ''}
                    >
                      {search.is_active_for_recommendations ? (
                        <Bell className="h-4 w-4" />
                      ) : (
                        <BellOff className="h-4 w-4" />
                      )}
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

