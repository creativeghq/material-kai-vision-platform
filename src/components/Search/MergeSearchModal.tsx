import { useState } from 'react';
import { GitMerge, Save, TrendingUp, Clock, Tag, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
// REMOVED: savedSearchesService deleted during cleanup
// import { MergeSuggestion } from '@/services/savedSearchesService';
type MergeSuggestion = any;

interface MergeSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mergeSuggestion: MergeSuggestion | null;
  onMerge: () => void;
  onSaveNew: () => void;
}

export const MergeSearchModal = ({
  open,
  onOpenChange,
  mergeSuggestion,
  onMerge,
  onSaveNew,
}: MergeSearchModalProps) => {
  const [merging, setMerging] = useState(false);

  if (!mergeSuggestion) return null;

  const { existing_search, similarity_score, reason, new_query } = mergeSuggestion;

  const handleMerge = async () => {
    setMerging(true);
    try {
      await onMerge();
      onOpenChange(false);
    } finally {
      setMerging(false);
    }
  };

  const handleSaveNew = () => {
    onSaveNew();
    onOpenChange(false);
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.95) return 'text-green-600';
    if (score >= 0.90) return 'text-blue-600';
    if (score >= 0.85) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getSimilarityLabel = (score: number) => {
    if (score >= 0.95) return 'Very High';
    if (score >= 0.90) return 'High';
    if (score >= 0.85) return 'Moderate';
    return 'Low';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Similar Search Found
          </DialogTitle>
          <DialogDescription>
            We found a similar saved search. Merging will combine them to keep your searches
            organized and reduce duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Similarity Score */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Similarity Match</span>
              <span className={`text-sm font-bold ${getSimilarityColor(similarity_score)}`}>
                {getSimilarityLabel(similarity_score)} ({(similarity_score * 100).toFixed(0)}%)
              </span>
            </div>
            <Progress value={similarity_score * 100} className="h-2" />
            <p className="text-xs text-muted-foreground">{reason}</p>
          </div>

          {/* Existing Search */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Existing Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-semibold text-base">{existing_search.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{existing_search.query}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Used {existing_search.use_count} times
                </Badge>
                {existing_search.merge_count > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    <GitMerge className="h-3 w-3 mr-1" />
                    Merged {existing_search.merge_count} searches
                  </Badge>
                )}
                {existing_search.last_used_at && (
                  <Badge variant="outline" className="text-xs">
                    Last used {new Date(existing_search.last_used_at).toLocaleDateString()}
                  </Badge>
                )}
              </div>

              {existing_search.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {existing_search.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* New Search */}
          <Card className="border-2 border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Save className="h-4 w-4" />
                New Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{new_query}</p>
            </CardContent>
          </Card>

          {/* Info Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Merging will:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Keep the existing search and update it with new details</li>
                <li>Combine search attributes and filters</li>
                <li>Preserve usage history and statistics</li>
                <li>Increment the merge counter</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Recommendation */}
          {similarity_score >= 0.90 && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                ✨ Recommended: Merge
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                These searches are very similar. Merging will help keep your saved searches
                organized and make it easier to find what you need.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleSaveNew}
            disabled={merging}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4 mr-2" />
            Save as New Search
          </Button>
          <Button
            onClick={handleMerge}
            disabled={merging}
            className="w-full sm:w-auto"
          >
            {merging ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4 mr-2" />
                Merge into Existing
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

