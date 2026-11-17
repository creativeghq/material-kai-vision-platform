import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Trash2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { MIVAA_API_URL } from '@/config/mivaa';
import { useToast } from '@/hooks/use-toast';

interface TempFileCleanupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CleanupStats {
  pdf_files_deleted: number;
  pdf_files_size_mb: number;
  pdf_processor_folders_deleted: number;
  pdf_processor_size_mb: number;
  output_files_deleted: number;
  output_size_mb: number;
  pycache_folders_deleted: number;
  pycache_size_mb: number;
  temp_processing_files_deleted: number;
  temp_processing_size_mb: number;
  total_size_freed_mb: number;
  errors: string[];
}

export function TempFileCleanupModal({ open, onOpenChange }: TempFileCleanupModalProps) {
  const { toast } = useToast();
  const [maxAgeHours, setMaxAgeHours] = useState(24);
  const [isLoading, setIsLoading] = useState(false);
  const [previewStats, setPreviewStats] = useState<CleanupStats | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${MIVAA_API_URL}/api/admin/system/cleanup-temp-files?max_age_hours=${maxAgeHours}&dry_run=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to preview cleanup');
      }

      const data = await response.json();
      setPreviewStats(data.stats);
      setShowPreview(true);
    } catch (error: any) {
      toast({
        title: 'Preview Failed',
        description: error.message || 'Failed to preview temp file cleanup',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${MIVAA_API_URL}/api/admin/system/cleanup-temp-files?max_age_hours=${maxAgeHours}&dry_run=false`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to cleanup temp files');
      }

      const data = await response.json();

      toast({
        title: 'Cleanup Complete',
        description: `Freed ${data.stats.total_size_freed_mb.toFixed(2)} MB of disk space`,
      });

      setPreviewStats(data.stats);
      setShowPreview(true);
    } catch (error: any) {
      toast({
        title: 'Cleanup Failed',
        description: error.message || 'Failed to cleanup temp files',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-orange-600" />
            System Temp File Cleanup
          </DialogTitle>
          <DialogDescription>
            Clean up temporary files to free disk space. This includes PDF files, processor folders, output files, and __pycache__ directories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Configuration */}
          <div>
            <label htmlFor="maxAgeHours" className="block text-sm font-medium mb-2">
              Delete files older than (hours)
            </label>
            <input
              id="maxAgeHours"
              type="number"
              min="1"
              max="720"
              value={maxAgeHours}
              onChange={(e) => setMaxAgeHours(parseInt(e.target.value) || 24)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default: 24 hours. Recommended: 24-168 hours (1-7 days)
            </p>
          </div>

          {/* Preview Stats */}
          {showPreview && previewStats && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Cleanup Statistics
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-600">PDF Files:</span>
                  <span className="ml-2 font-medium">{previewStats.pdf_files_deleted} files ({previewStats.pdf_files_size_mb.toFixed(2)} MB)</span>
                </div>
                <div>
                  <span className="text-gray-600">PDF Processor Folders:</span>
                  <span className="ml-2 font-medium">{previewStats.pdf_processor_folders_deleted} folders ({previewStats.pdf_processor_size_mb.toFixed(2)} MB)</span>
                </div>
                <div>
                  <span className="text-gray-600">Output Files:</span>
                  <span className="ml-2 font-medium">{previewStats.output_files_deleted} files ({previewStats.output_size_mb.toFixed(2)} MB)</span>
                </div>
                <div>
                  <span className="text-gray-600">__pycache__ Folders:</span>
                  <span className="ml-2 font-medium">{previewStats.pycache_folders_deleted} folders ({previewStats.pycache_size_mb.toFixed(2)} MB)</span>
                </div>
                <div>
                  <span className="text-gray-600">Temp Processing Files:</span>
                  <span className="ml-2 font-medium">{previewStats.temp_processing_files_deleted} items ({previewStats.temp_processing_size_mb.toFixed(2)} MB)</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-gray-300">
                  <span className="text-gray-900 font-semibold">Total Space Freed:</span>
                  <span className="ml-2 font-bold text-green-600">{previewStats.total_size_freed_mb.toFixed(2)} MB</span>
                </div>
              </div>

              {previewStats.errors && previewStats.errors.length > 0 && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                  <p className="text-xs font-semibold text-red-800 mb-1">Errors:</p>
                  <ul className="text-xs text-red-700 list-disc list-inside">
                    {previewStats.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Warning */}
          <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-orange-800">
                <p className="font-semibold mb-1">⚠️ Warning</p>
                <p className="text-xs">
                  This will permanently delete temporary files older than {maxAgeHours} hours.
                  Preview the cleanup first to see what will be deleted.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePreview}
              variant="outline"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Preview Cleanup'
              )}
            </Button>
            <Button
              onClick={handleCleanup}
              className="bg-orange-600 hover:bg-orange-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Run Cleanup
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


