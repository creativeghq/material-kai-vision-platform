/**
 * Schedule Import Modal
 * 
 * Configure cron schedules for recurring XML imports
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ImportJob {
  id: string;
  source_name: string;
  is_scheduled: boolean;
  cron_schedule: string | null;
  source_url: string | null;
  next_run_at: string | null;
}

interface ScheduleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ImportJob;
  onScheduled: () => void;
}

const CRON_PRESETS = [
  { label: 'Every Hour', value: '0 * * * *', description: 'Runs at the start of every hour' },
  { label: 'Every 6 Hours', value: '0 */6 * * *', description: 'Runs every 6 hours' },
  { label: 'Every 12 Hours', value: '0 */12 * * *', description: 'Runs every 12 hours' },
  { label: 'Daily at Midnight', value: '0 0 * * *', description: 'Runs once per day at 00:00' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0', description: 'Runs every Sunday at midnight' },
  { label: 'Monthly (1st)', value: '0 0 1 * *', description: 'Runs on the 1st of each month' },
  { label: 'Custom', value: 'custom', description: 'Enter your own cron expression' },
];

const ScheduleImportModal: React.FC<ScheduleImportModalProps> = ({
  isOpen,
  onClose,
  job,
  onScheduled,
}) => {
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<string>(
    job.cron_schedule || '0 */6 * * *'
  );
  const [customCron, setCustomCron] = useState('');
  const [sourceUrl, setSourceUrl] = useState(job.source_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!sourceUrl) {
      setError('Source URL is required for scheduled imports');
      return;
    }

    const cronSchedule = selectedPreset === 'custom' ? customCron : selectedPreset;

    if (!cronSchedule) {
      setError('Please select a schedule or enter a custom cron expression');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Calculate next run time
      const nextRunAt = calculateNextRun(cronSchedule);

      // Update job with schedule
      const { error: updateError } = await supabase
        .from('data_import_jobs')
        .update({
          is_scheduled: true,
          cron_schedule: cronSchedule,
          source_url: sourceUrl,
          next_run_at: nextRunAt,
        })
        .eq('id', job.id);

      if (updateError) throw updateError;

      toast({
        title: 'Schedule Saved',
        description: `Import will run ${getScheduleDescription(cronSchedule)}`,
      });

      onScheduled();
      onClose();
    } catch (err: any) {
      console.error('Schedule save error:', err);
      setError(err.message || 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('data_import_jobs')
        .update({
          is_scheduled: false,
          cron_schedule: null,
          next_run_at: null,
        })
        .eq('id', job.id);

      if (updateError) throw updateError;

      toast({
        title: 'Schedule Removed',
        description: 'This import will no longer run automatically',
      });

      onScheduled();
      onClose();
    } catch (err: any) {
      console.error('Schedule delete error:', err);
      setError(err.message || 'Failed to remove schedule');
    } finally {
      setIsDeleting(false);
    }
  };

  const calculateNextRun = (cronSchedule: string): string => {
    const now = new Date();

    if (cronSchedule === '0 * * * *') {
      now.setHours(now.getHours() + 1, 0, 0, 0);
    } else if (cronSchedule === '0 */6 * * *') {
      now.setHours(now.getHours() + 6, 0, 0, 0);
    } else if (cronSchedule === '0 */12 * * *') {
      now.setHours(now.getHours() + 12, 0, 0, 0);
    } else if (cronSchedule === '0 0 * * *') {
      now.setDate(now.getDate() + 1);
      now.setHours(0, 0, 0, 0);
    } else if (cronSchedule === '0 0 * * 0') {
      const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntilSunday);
      now.setHours(0, 0, 0, 0);
    } else if (cronSchedule === '0 0 1 * *') {
      now.setMonth(now.getMonth() + 1, 1);
      now.setHours(0, 0, 0, 0);
    } else {
      now.setHours(now.getHours() + 1);
    }

    return now.toISOString();
  };

  const getScheduleDescription = (cronSchedule: string): string => {
    const preset = CRON_PRESETS.find((p) => p.value === cronSchedule);
    return preset ? preset.description.toLowerCase() : 'on custom schedule';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Calendar className="h-6 w-6 text-purple-400" />
            Schedule Recurring Import
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure automatic imports for: <strong>{job.source_name}</strong>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Source URL */}
          <div className="space-y-2">
            <Label htmlFor="source-url" className="text-white">
              Source URL <span className="text-red-400">*</span>
            </Label>
            <Input
              id="source-url"
              placeholder="https://example.com/catalog.xml"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white"
            />
            <p className="text-xs text-gray-400">
              URL to fetch the XML file from on each scheduled run
            </p>
          </div>

          {/* Schedule Preset */}
          <div className="space-y-2">
            <Label htmlFor="schedule" className="text-white">
              Schedule <span className="text-red-400">*</span>
            </Label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger id="schedule" className="bg-gray-700 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600">
                {CRON_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    <div>
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-gray-400">{preset.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Cron Expression */}
          {selectedPreset === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="custom-cron" className="text-white">
                Custom Cron Expression
              </Label>
              <Input
                id="custom-cron"
                placeholder="0 */6 * * *"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white font-mono"
              />
              <p className="text-xs text-gray-400">
                Format: minute hour day month dayOfWeek (e.g., "0 */6 * * *" for every 6 hours)
              </p>
            </div>
          )}

          {/* Current Schedule Info */}
          {job.is_scheduled && job.next_run_at && (
            <div className="p-3 bg-purple-900/20 border border-purple-700 rounded text-sm">
              <strong>Current Schedule:</strong> {job.cron_schedule}
              <br />
              <strong>Next Run:</strong> {new Date(job.next_run_at).toLocaleString()}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-gray-700">
          <div>
            {job.is_scheduled && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="bg-red-600/20 border-red-600 text-red-300 hover:bg-red-600/30"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Schedule
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isDeleting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  {job.is_scheduled ? 'Update Schedule' : 'Save Schedule'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleImportModal;

