import React, { useState, useEffect, useMemo } from 'react';
import { useWebSocket, useWebSocketSubscription } from '@/hooks/useWebSocket';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Trash2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Search,
  Download,
  Eye,
  MoreHorizontal,
  Users,
  FileText,
  Activity,
  TrendingUp
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Types for job queue management
export interface JobItem {
  id: string;
  batchId: string;
  name: string;
  type: 'pdf_extraction' | 'image_analysis' | 'text_processing' | 'data_export';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  progress: number;
  filesTotal: number;
  filesProcessed: number;
  filesSucceeded: number;
  filesFailed: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  userId: string;
  userName: string;
  errorMessage?: string;
  resultUrl?: string;
  tags: string[];
}

export interface QueueStats {
  totalJobs: number;
  runningJobs: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  throughputPerHour: number;
  queueWaitTime: number;
}

interface JobQueueDashboardProps {
  className?: string;
  maxHeight?: string;
  showControls?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const JobQueueDashboard: React.FC<JobQueueDashboardProps> = ({
  className = '',
  maxHeight = '600px',
  showControls = true,
  autoRefresh = true,
  refreshInterval = 5000
}) => {
  // State management
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection for real-time updates
  useWebSocket(
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'
  );

  // Subscribe to job queue updates
  useWebSocketSubscription(
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080',
    'job_queue_update',
    (data: any) => {
      if (data.type === 'job_updated') {
        setJobs(prev => prev.map(job =>
          job.id === data.job.id ? { ...job, ...data.job } : job
        ));
      } else if (data.type === 'job_added') {
        setJobs(prev => [data.job, ...prev]);
      } else if (data.type === 'job_removed') {
        setJobs(prev => prev.filter(job => job.id !== data.jobId));
      } else if (data.type === 'stats_updated') {
        setStats(data.stats);
      }
    }
  );

  // Load initial data
  useEffect(() => {
    loadJobQueue();
    loadQueueStats();
  }, []);

  // Auto-refresh data
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadJobQueue();
      loadQueueStats();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Load job queue data
  const loadJobQueue = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // In a real implementation, this would be an API call
      const response = await fetch('/api/jobs/queue');
      if (!response.ok) throw new Error('Failed to load job queue');
      
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job queue');
      console.error('Error loading job queue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load queue statistics
  const loadQueueStats = async () => {
    try {
      const response = await fetch('/api/jobs/stats');
      if (!response.ok) throw new Error('Failed to load queue stats');
      
      const data = await response.json();
      setStats(data.stats);
    } catch (err) {
      console.error('Error loading queue stats:', err);
    }
  };

  // Filter and sort jobs
  const filteredAndSortedJobs = useMemo(() => {
    let filtered = jobs;

    // Apply tab filter
    if (selectedTab !== 'all') {
      filtered = filtered.filter(job => job.status === selectedTab);
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(job => job.status === filterStatus);
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(job => job.type === filterType);
    }

    // Apply priority filter
    if (filterPriority !== 'all') {
      filtered = filtered.filter(job => job.priority === filterPriority);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(job =>
        job.name.toLowerCase().includes(query) ||
        job.userName.toLowerCase().includes(query) ||
        job.batchId.toLowerCase().includes(query) ||
        job.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Sort jobs
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy as keyof JobItem];
      let bValue: any = b[sortBy as keyof JobItem];

      if (aValue instanceof Date) aValue = aValue.getTime();
      if (bValue instanceof Date) bValue = bValue.getTime();

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [jobs, selectedTab, filterStatus, filterType, filterPriority, searchQuery, sortBy, sortOrder]);

  // Job control actions
  const handleJobAction = async (jobId: string, action: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/${action}`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error(`Failed to ${action} job`);

      // Note: WebSocket message sending would be handled by the backend API
      // The real-time updates will come through the subscription

      // Refresh data
      loadJobQueue();
    } catch (err) {
      console.error(`Error ${action} job:`, err);
      setError(`Failed to ${action} job`);
    }
  };

  // Batch actions for selected jobs
  const handleBatchAction = async (action: string) => {
    if (selectedJobs.size === 0) return;

    try {
      const response = await fetch('/api/jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobIds: Array.from(selectedJobs),
          action
        })
      });

      if (!response.ok) throw new Error(`Failed to ${action} selected jobs`);

      setSelectedJobs(new Set());
      loadJobQueue();
    } catch (err) {
      console.error(`Error ${action} jobs:`, err);
      setError(`Failed to ${action} selected jobs`);
    }
  };

  // Get status badge variant
  const getStatusBadge = (status: JobItem['status']) => {
    const variants = {
      pending: {
        className: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        icon: Clock
      },
      running: {
        className: 'bg-primary text-primary-foreground hover:bg-primary/80',
        icon: Activity
      },
      completed: {
        className: 'bg-primary text-primary-foreground hover:bg-primary/80',
        icon: CheckCircle
      },
      failed: {
        className: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        icon: XCircle
      },
      paused: {
        className: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        icon: Pause
      },
      cancelled: {
        className: 'border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        icon: Square
      }
    };

    const config = variants[status];
    const Icon = config.icon;

    return (
      <Badge className={`flex items-center gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Get priority badge variant
  const getPriorityBadge = (priority: JobItem['priority']) => {
    const getVariantClassName = (variant: string) => {
      switch (variant) {
        case 'outline':
          return 'border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground';
        case 'secondary':
          return 'bg-secondary text-secondary-foreground hover:bg-secondary/80';
        case 'default':
          return 'bg-primary text-primary-foreground hover:bg-primary/80';
        case 'destructive':
          return 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
        default:
          return 'bg-primary text-primary-foreground hover:bg-primary/80';
      }
    };

    const variants = {
      low: 'outline' as const,
      normal: 'secondary' as const,
      high: 'default' as const,
      urgent: 'destructive' as const
    };

    return (
      <Badge className={`text-xs ${getVariantClassName(variants[priority])}`}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  // Calculate job statistics by tab
  const getTabCounts = () => {
    return {
      all: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length
    };
  };

  const tabCounts = getTabCounts();

  return (
    <TooltipProvider>
      <div className={`space-y-4 ${className}`}>
        {/* Queue Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Jobs</p>
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
                    <p className="text-sm font-medium text-muted-foreground">Running</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.runningJobs}</p>
                  </div>
                  <Activity className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Throughput</p>
                    <p className="text-2xl font-bold text-green-600">{stats.throughputPerHour}/h</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Avg. Time</p>
                    <p className="text-2xl font-bold">{formatDuration(stats.averageProcessingTime)}</p>
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
                <CardDescription>
                  Monitor and manage batch processing jobs in real-time
                </CardDescription>
              </div>
              
              {showControls && (
                <div className="flex items-center gap-2">
                  {selectedJobs.size > 0 && (
                    <>
                      <Button
                        className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleBatchAction('pause')}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause ({selectedJobs.size})
                      </Button>
                      <Button
                        className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                        onClick={() => handleBatchAction('cancel')}
                      >
                        <Square className="h-4 w-4 mr-1" />
                        Cancel ({selectedJobs.size})
                      </Button>
                    </>
                  )}
                  
                  <Button
                    className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => loadJobQueue()}
                    disabled={isLoading}
                  >
                    <RotateCcw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
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
                  <SelectItem value="pdf_extraction">PDF Extraction</SelectItem>
                  <SelectItem value="image_analysis">Image Analysis</SelectItem>
                  <SelectItem value="text_processing">Text Processing</SelectItem>
                  <SelectItem value="data_export">Data Export</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Created</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="progress">Progress</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>

              <Button
                className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>

            {/* Job Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
                <TabsTrigger value="running">Running ({tabCounts.running})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({tabCounts.completed})</TabsTrigger>
                <TabsTrigger value="failed">Failed ({tabCounts.failed})</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedTab} className="mt-4">
                <ScrollArea style={{ maxHeight }} className="w-full">
                  <div className="space-y-2">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : filteredAndSortedJobs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No jobs found matching the current filters
                      </div>
                    ) : (
                      filteredAndSortedJobs.map((job) => (
                        <Card key={job.id} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
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
                                className="rounded"
                              />

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium truncate">{job.name}</h4>
                                  {getStatusBadge(job.status)}
                                  {getPriorityBadge(job.priority)}
                                </div>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {job.userName}
                                  </span>
                                  <span>Batch: {job.batchId}</span>
                                  <span>{job.filesProcessed}/{job.filesTotal} files</span>
                                  <span>{new Date(job.createdAt).toLocaleString()}</span>
                                </div>

                                {job.status === 'running' && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span>Progress: {job.progress}%</span>
                                      {job.estimatedDuration && (
                                        <span>ETA: {formatDuration(job.estimatedDuration)}</span>
                                      )}
                                    </div>
                                    <Progress value={job.progress} className="h-2" />
                                  </div>
                                )}

                                {job.errorMessage && (
                                  <div className="mt-2 text-sm text-red-600">
                                    Error: {job.errorMessage}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {job.status === 'running' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                                      onClick={() => handleJobAction(job.id, 'pause')}
                                    >
                                      <Pause className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Pause Job</TooltipContent>
                                </Tooltip>
                              )}

                              {job.status === 'paused' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                                      onClick={() => handleJobAction(job.id, 'resume')}
                                    >
                                      <Play className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Resume Job</TooltipContent>
                                </Tooltip>
                              )}

                              {job.status === 'failed' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                                      onClick={() => handleJobAction(job.id, 'retry')}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Retry Job</TooltipContent>
                                </Tooltip>
                              )}

                              {job.resultUrl && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                                      onClick={() => window.open(job.resultUrl, '_blank')}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Download Results</TooltipContent>
                                </Tooltip>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button className="h-8 px-3 text-sm border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleJobAction(job.id, 'view')}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleJobAction(job.id, 'cancel')}>
                                    <Square className="h-4 w-4 mr-2" />
                                    Cancel Job
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleJobAction(job.id, 'delete')}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Job
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default JobQueueDashboard;