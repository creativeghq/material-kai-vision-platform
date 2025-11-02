import React, { useState } from 'react';
import {
  FileText,
  Activity,
  TrendingUp,
  Clock,
  Search,
  RotateCcw,
  Pause,
  Square,
  AlertCircle,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface JobItem {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
  progress?: number;
  error?: string;
}

interface JobStats {
  totalJobs: number;
  runningJobs: number;
  throughputPerHour: number;
  averageProcessingTime: number;
}

interface JobQueueDashboardProps {
  className?: string;
  showControls?: boolean;
  stats?: JobStats;
  jobs?: JobItem[];
  isLoading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onBatchAction?: (action: string, jobIds: string[]) => void;
}

export const JobQueueDashboard: React.FC<JobQueueDashboardProps> = ({
  className = '',
  showControls = true,
  stats,
  jobs = [],
  isLoading = false,
  error,
  onRefresh,
  onBatchAction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  const handleBatchAction = (action: string) => {
    if (onBatchAction && selectedJobs.size > 0) {
      onBatchAction(action, Array.from(selectedJobs));
    }
  };

  const formatDuration = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusBadge = (status: JobItem['status']) => {
    const config = {
      pending: { className: 'bg-yellow-100 text-yellow-800', icon: Clock },
      running: { className: 'bg-blue-100 text-blue-800', icon: Activity },
      completed: { className: 'bg-green-100 text-green-800', icon: FileText },
      failed: { className: 'bg-red-100 text-red-800', icon: AlertCircle },
      paused: { className: 'bg-gray-100 text-gray-800', icon: Pause },
    }[status];

    const Icon = config.icon;

    return (
      <Badge className={`flex items-center gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Queue Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Jobs
                  </p>
                  <p className="text-2xl font-bold">{stats.totalJobs}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Running
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.runningJobs}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Throughput
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.throughputPerHour}/h
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Avg. Time
                  </p>
                  <p className="text-2xl font-bold">
                    {formatDuration(stats.averageProcessingTime)}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Job Queue Dashboard</CardTitle>
            </div>
            {showControls && (
              <div className="flex items-center gap-2">
                {selectedJobs.size > 0 && (
                  <>
                    <Button
                      className="h-8 px-3 text-sm"
                      onClick={() => handleBatchAction('pause')}
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      Pause ({selectedJobs.size})
                    </Button>
                    <Button
                      className="h-8 px-3 text-sm"
                      onClick={() => handleBatchAction('cancel')}
                    >
                      <Square className="h-4 w-4 mr-1" />
                      Cancel ({selectedJobs.size})
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isLoading}
                >
                  <RotateCcw
                    className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters and Search */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
              />
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="pdf">PDF Processing</SelectItem>
                <SelectItem value="image">Image Analysis</SelectItem>
                <SelectItem value="embedding">Embedding Generation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Job List */}
          <div className="space-y-2">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No jobs found
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedJobs.has(job.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedJobs);
                        if (e.target.checked) {
                          newSelected.add(job.id);
                        } else {
                          newSelected.delete(job.id);
                        }
                        setSelectedJobs(newSelected);
                      }}
                    />
                    <div>
                      <p className="font-medium">{job.type}</p>
                      <p className="text-sm text-muted-foreground">{job.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(job.status)}
                    <span className="text-sm text-muted-foreground">
                      {new Date(job.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JobQueueDashboard;
