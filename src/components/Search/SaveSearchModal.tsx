import { useState, useEffect } from 'react';
import { Save, Tag, Globe, Lock, Bell, BellOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
// REMOVED: savedSearchesService deleted during cleanup
// import { savedSearchesService, CreateSavedSearchData, MergeSuggestion } from '@/services/savedSearchesService';
type CreateSavedSearchData = any;
type MergeSuggestion = any;
const savedSearchesService = {
  checkForDuplicates: async () => { throw new Error('Deprecated: Use MIVAA API /api/saved-searches'); },
  createSavedSearch: async () => { throw new Error('Deprecated: Use MIVAA API /api/saved-searches'); },
  mergeIntoExisting: async () => { throw new Error('Deprecated: Use MIVAA API /api/saved-searches'); },
};
import { MaterialFilters } from './MaterialFiltersPanel';
import { MergeSearchModal } from './MergeSearchModal';

interface SaveSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchData: {
    query: string;
    searchStrategy?: string;
    filters?: Record<string, any>;
    materialFilters?: MaterialFilters;
    conversationId?: string;
    moodboardId?: string;
    generation3dId?: string;
    spatialContext?: Record<string, any>;
    resultsSnapshot?: any[];
  };
  onSaved?: () => void;
}

export const SaveSearchModal = ({
  open,
  onOpenChange,
  searchData,
  onSaved,
}: SaveSearchModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [recommendationFrequency, setRecommendationFrequency] = useState<
    'daily' | 'weekly' | 'never'
  >('daily');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [mergeSuggestion, setMergeSuggestion] = useState<MergeSuggestion | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const { toast } = useToast();

  // Check for duplicates when modal opens
  useEffect(() => {
    if (open && searchData.query) {
      checkForDuplicates();
    }
  }, [open, searchData.query]);

  const checkForDuplicates = async () => {
    setChecking(true);
    try {
      const suggestion = await savedSearchesService.checkForDuplicates(
        searchData.query,
        searchData.filters || {},
        searchData.materialFilters || {}
      );

      if (suggestion) {
        setMergeSuggestion(suggestion);
        setShowMergeModal(true);
        onOpenChange(false); // Close save modal, show merge modal
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      // Continue with normal save if check fails
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a name for the search',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      const data: CreateSavedSearchData = {
        name: name.trim(),
        description: description.trim() || undefined,
        query: searchData.query,
        search_strategy: searchData.searchStrategy || 'hybrid',
        filters: searchData.filters,
        material_filters: searchData.materialFilters,
        conversation_id: searchData.conversationId,
        moodboard_id: searchData.moodboardId,
        generation_3d_id: searchData.generation3dId,
        spatial_context: searchData.spatialContext,
        results_snapshot: searchData.resultsSnapshot,
        is_public: isPublic,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        recommendation_frequency: recommendationFrequency,
      };

      await savedSearchesService.createSavedSearch(data);

      toast({
        title: 'Success',
        description: 'Search saved successfully',
      });

      // Reset form
      setName('');
      setDescription('');
      setTags('');
      setIsPublic(false);
      setRecommendationFrequency('daily');

      onOpenChange(false);

      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      console.error('Error saving search:', error);
      toast({
        title: 'Error',
        description: 'Failed to save search',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Save Search
          </DialogTitle>
          <DialogDescription>
            Save this search for quick access later. You can also enable daily recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Kitchen Materials Search"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description of what you're searching for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Query Preview */}
          <div className="space-y-2">
            <Label>Search Query</Label>
            <div className="p-3 bg-muted rounded-md text-sm">
              {searchData.query || 'No query specified'}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </Label>
            <Input
              id="tags"
              placeholder="kitchen, modern, wood (comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Add tags to organize and find your searches easily
            </p>
          </div>

          {/* Public/Private */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                {isPublic ? (
                  <Globe className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Make Public
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow other users to discover and use this search
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          {/* Recommendation Frequency */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              {recommendationFrequency === 'never' ? (
                <BellOff className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              Recommendation Frequency
            </Label>
            <Select
              value={recommendationFrequency}
              onValueChange={(value: any) => setRecommendationFrequency(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily - Get recommendations every day</SelectItem>
                <SelectItem value="weekly">Weekly - Get recommendations once a week</SelectItem>
                <SelectItem value="never">Never - Don't send recommendations</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Receive personalized material recommendations based on this search
            </p>
          </div>

          {/* Context Info */}
          {(searchData.conversationId ||
            searchData.moodboardId ||
            searchData.generation3dId) && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md text-sm">
              <p className="font-medium mb-1">Linked Context:</p>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {searchData.conversationId && <li>• Linked to chat conversation</li>}
                {searchData.moodboardId && <li>• Linked to moodboard</li>}
                {searchData.generation3dId && <li>• Linked to 3D generation</li>}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || checking}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || checking}>
            {checking ? 'Checking...' : saving ? 'Saving...' : 'Save Search'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Wrapper component that includes merge modal
export const SaveSearchModalWithDeduplication = (props: SaveSearchModalProps) => {
  const [mergeSuggestion, setMergeSuggestion] = useState<MergeSuggestion | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(props.open);

  useEffect(() => {
    setShowSaveModal(props.open);
  }, [props.open]);

  const handleMerge = async () => {
    if (!mergeSuggestion) return;

    try {
      await savedSearchesService.mergeIntoExisting(
        mergeSuggestion.existing_search.id,
        mergeSuggestion.new_query,
        props.searchData.filters || {},
        props.searchData.materialFilters || ({} as MaterialFilters)
      );

      if (props.onSaved) {
        props.onSaved();
      }
    } catch (error) {
      console.error('Error merging search:', error);
    }
  };

  const handleSaveNew = () => {
    setShowMergeModal(false);
    setShowSaveModal(true);
  };

  return (
    <>
      <SaveSearchModal
        {...props}
        open={showSaveModal}
        onOpenChange={(open) => {
          setShowSaveModal(open);
          props.onOpenChange(open);
        }}
      />
      <MergeSearchModal
        open={showMergeModal}
        onOpenChange={setShowMergeModal}
        mergeSuggestion={mergeSuggestion}
        onMerge={handleMerge}
        onSaveNew={handleSaveNew}
      />
    </>
  );
};

