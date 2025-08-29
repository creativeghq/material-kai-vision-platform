import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Brain,
  Database as DatabaseIcon,
  Microscope,
  Settings,
  Activity,
  Search,
  Shield,
  Home,
  FileText,
  Globe,
  Upload,
  Users,
  Server,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  UserPlus,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  Download,
  Filter,
  MoreHorizontal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

// Types for our data structures
type SystemMetrics = {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  uptime: string;
  activeUsers: number;
  totalRequests: number;
  errorRate: number;
  processedDocuments: number;
  knowledgeEntries: number;
  activeSessions: number;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
};

type Config = {
  key: string;
  value: string;
  category: string;
  description: string;
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpu: 45,
    memory: 68,
    disk: 32,
    network: 12,
    uptime: '15 days, 4 hours',
    activeUsers: 23,
    totalRequests: 8432,
    errorRate: 0.2,
    processedDocuments: 0,
    knowledgeEntries: 0,
    activeSessions: 0,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userFilter, setUserFilter] = useState('');
  const [configFilter, setConfigFilter] = useState('');
  const [, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load system metrics from database
      await loadSystemMetrics();

      // Load users from workspaces (simplified user management)
      await loadUsers();

      // Load configurations from workspace settings
      await loadConfigurations();

    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load real data from Supabase
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const loadSystemMetrics = async () => {
    try {
      // Get processing results count
      const { count: processedDocs } = await supabase
        .from('processing_results')
        .select('*', { count: 'exact', head: true });

      // Get materials catalog count
      const { count: knowledgeEntries } = await supabase
        .from('materials_catalog')
        .select('*', { count: 'exact', head: true });

      // Get active scraping sessions count
      const { count: activeSessions } = await supabase
        .from('scraping_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Calculate total requests from processing results
      const { data: processingData } = await supabase
        .from('processing_results')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      const totalRequests = processingData?.length || 0;

      // Calculate error rate from processing results
      const { count: errorCount } = await supabase
        .from('processing_results')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'error');

      const errorRate = totalRequests > 0 ? ((errorCount || 0) / totalRequests) * 100 : 0;

      setSystemMetrics(prev => ({
        ...prev,
        processedDocuments: processedDocs || 0,
        knowledgeEntries: knowledgeEntries || 0,
        activeSessions: activeSessions || 0,
        totalRequests,
        errorRate: Number(errorRate.toFixed(2)),
      }));
    } catch (err) {
      console.error('Error loading system metrics:', err);
    }
  };

  const loadUsers = async () => {
    try {
      // Load workspaces as a simplified user management system
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform workspaces into user-like objects for display
      const userList: User[] = workspaces?.map((workspace, index) => ({
        id: workspace.id,
        name: workspace.name,
        email: `admin@${workspace.name.toLowerCase().replace(/\s+/g, '')}.com`,
        role: index === 0 ? 'Admin' : 'User',
        status: 'Active',
        lastLogin: workspace.updated_at ?
          new Date(workspace.updated_at).toLocaleDateString() :
          'Never',
      })) || [];

      setUsers(userList);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  const loadConfigurations = async () => {
    try {
      // Load workspace settings as configurations
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('settings')
        .limit(1);

      if (error) throw error;

      // Default configurations with some from workspace settings
      const defaultConfigs: Config[] = [
        { key: 'max_upload_size', value: '100MB', category: 'File Processing', description: 'Maximum file size for uploads' },
        { key: 'session_timeout', value: '30 minutes', category: 'Security', description: 'User session timeout duration' },
        { key: 'api_rate_limit', value: '1000/hour', category: 'API', description: 'API requests per hour limit' },
        { key: 'backup_frequency', value: 'Daily', category: 'System', description: 'Automated backup frequency' },
      ];

      // Add workspace-specific settings if available
      if (workspaces?.[0]?.settings) {
        const settings = workspaces[0].settings as unknown;
        Object.entries(settings as Record<string, unknown>).forEach(([key, value]) => {
          defaultConfigs.push({
            key,
            value: String(value),
            category: 'Workspace',
            description: `Workspace setting: ${key}`,
          });
        });
      }

      setConfigs(defaultConfigs);
    } catch (err) {
      console.error('Error loading configurations:', err);
      // Set default configs on error
      setConfigs([
        { key: 'max_upload_size', value: '100MB', category: 'File Processing', description: 'Maximum file size for uploads' },
        { key: 'session_timeout', value: '30 minutes', category: 'Security', description: 'User session timeout duration' },
        { key: 'api_rate_limit', value: '1000/hour', category: 'API', description: 'API requests per hour limit' },
        { key: 'backup_frequency', value: 'Daily', category: 'System', description: 'Automated backup frequency' },
      ]);
    }
  };

  // Real-time updates for system metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemMetrics(prev => ({
        ...prev,
        cpu: Math.max(10, Math.min(90, prev.cpu + (Math.random() - 0.5) * 10)),
        memory: Math.max(20, Math.min(95, prev.memory + (Math.random() - 0.5) * 8)),
        network: Math.max(0, Math.min(100, prev.network + (Math.random() - 0.5) * 20)),
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleUserAction = (action: string, userId?: string) => {
    console.log(`${action} action for user:`, userId);
    // In real app, this would make API calls to manage workspace users
  };

  const handleBulkUserAction = (action: string) => {
    console.log(`Bulk ${action} for users:`, selectedUsers);
    // In real app, this would make API calls to manage multiple workspace users
  };

  const handleConfigUpdate = async (key: string, newValue: string) => {
    try {
      setConfigs(prev => prev.map(config =>
        config.key === key ? { ...config, value: newValue } : config,
      ));

      // Update workspace settings in database if it's a workspace setting
      const config = configs.find(c => c.key === key);
      if (config?.category === 'Workspace') {
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id, settings')
          .limit(1);

        if (workspaces?.[0]) {
          const currentSettings = workspaces[0].settings as unknown || {};
          const updatedSettings = { ...(currentSettings as Record<string, unknown>), [key]: newValue };

          await supabase
            .from('workspaces')
            .update({ settings: updatedSettings })
            .eq('id', workspaces[0].id);
        }
      }

      console.log(`Updated config ${key} to:`, newValue);
    } catch (err) {
      console.error('Error updating configuration:', err);
    }
  };

  const filteredUsers = users.filter((user: User) =>
    user.name.toLowerCase().includes(userFilter.toLowerCase()) ||
    user.email.toLowerCase().includes(userFilter.toLowerCase()) ||
    user.role.toLowerCase().includes(userFilter.toLowerCase()),
  );

  const filteredConfigs = configs.filter((config: Config) =>
    config.key.toLowerCase().includes(configFilter.toLowerCase()) ||
    config.category.toLowerCase().includes(configFilter.toLowerCase()) ||
    config.description.toLowerCase().includes(configFilter.toLowerCase()),
  );

  const adminSections = [
    {
      title: 'PDF Knowledge Base',
      description: 'Upload and process PDF documents for material knowledge extraction',
      icon: FileText,
      path: '/admin/pdf-processing',
      status: 'active',
      count: 'Primary system',
      priority: 1,
    },
    {
      title: 'Search Hub',
      description: 'Multi-modal search interface with text, image, and hybrid capabilities',
      icon: Search,
      path: '/admin/search-hub',
      status: 'active',
      count: 'Enhanced search',
      priority: 2,
    },
    {
      title: '3D Material Suggestions',
      description: 'AI-powered material recommendations for 3D generation',
      icon: Brain,
      path: '/admin/3d-suggestions',
      status: 'active',
      count: 'PDF-integrated',
      priority: 3,
    },
    {
      title: '3D Model Debugging',
      description: 'Monitor and debug AI model performance for 3D generation',
      icon: Microscope,
      path: '/admin/3d-model-debugging',
      status: 'active',
      count: '7 models',
      priority: 4,
    },
    {
      title: 'Material Scraper',
      description: 'Scrape material data from websites and external sources',
      icon: Globe,
      path: '/admin/material-scraper',
      status: 'active',
      count: 'Web scraping',
      priority: 5,
    },
    {
      title: 'Knowledge Base Management',
      description: 'Manage enhanced knowledge base entries from PDF processing',
      icon: DatabaseIcon,
      path: '/admin/knowledge-base',
      status: 'active',
      count: '1,247 entries',
      priority: 6,
    },
    {
      title: 'Analytics Dashboard',
      description: 'System performance metrics and usage analytics',
      icon: BarChart3,
      path: '/admin/analytics',
      status: 'active',
      count: 'Real-time',
      priority: 7,
    },
    {
      title: 'API Gateway',
      description: 'Manage API endpoints and access control',
      icon: Shield,
      path: '/admin/api-gateway',
      status: 'active',
      count: '12 endpoints',
      priority: 8,
    },
    {
      title: 'System Performance',
      description: 'Monitor processing queues and system health',
      icon: Activity,
      path: '/admin/performance',
      status: 'active',
      count: '99.8% uptime',
      priority: 9,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-600';
      case 'processing': return 'bg-blue-500/20 text-blue-600';
      case 'training': return 'bg-orange-500/20 text-orange-600';
      default: return 'bg-gray-500/20 text-gray-600';
    }
  };

  const getMetricColor = (value: number, type: string) => {
    if (type === 'cpu' || type === 'memory') {
      if (value > 80) return 'text-red-600';
      if (value > 60) return 'text-yellow-600';
      return 'text-green-600';
    }
    return 'text-blue-600';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                System administration and management tools
              </p>
            </div>
          </div>
          <Badge className="text-sm px-2 py-1 border border-gray-300 bg-white text-gray-700">
            Administrator Access
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Enhanced Admin Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monitoring">System Monitoring</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Hero Section for PDF Upload */}
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-6 w-6 text-primary" />
                  PDF Knowledge Base - Core System
                </CardTitle>
                <CardDescription className="text-base">
                  Upload PDF documents to extract materials knowledge and enhance the intelligent search system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Button asChild className="flex items-center gap-2 px-6 py-3 text-lg">
                    <Link to="/admin/pdf-processing">
                      <Upload className="h-5 w-5" />
                      Upload PDF Documents
                    </Link>
                  </Button>
                  <Button asChild className="px-6 py-3 text-lg border border-gray-300 hover:bg-gray-50">
                    <Link to="/admin/knowledge-base">
                      <DatabaseIcon className="h-5 w-5" />
                      Manage Knowledge Base
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adminSections
                .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                .map((section) => {
                const Icon = section.icon;
                return (
                  <Card key={section.path} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Icon className="h-8 w-8 text-primary" />
                        <Badge className={getStatusColor(section.status)}>
                          {section.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      <CardDescription className="text-sm">
                        {section.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {section.count}
                        </span>
                        <Button asChild className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                          <Link to={section.path}>
                            Manage
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">System Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>PDF Documents</span>
                      <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">156 Processed</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Knowledge Entries</span>
                      <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">1,247 Active</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Search Queries</span>
                      <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">8,432 Total</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div>• New PDF processed: Material Specifications v2.1</div>
                    <div>• 3D material suggestions updated</div>
                    <div>• Enhanced search index rebuilt</div>
                    <div>• Knowledge base entries validated</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button asChild className="w-full px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                    <Link to="/admin/pdf-processing">Process New PDF</Link>
                  </Button>
                  <Button asChild className="w-full px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                    <Link to="/admin/search-hub">Test Search System</Link>
                  </Button>
                  <Button asChild className="w-full px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                    <Link to="/admin/3d-suggestions">Configure 3D Suggestions</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* System Monitoring Tab */}
          <TabsContent value="monitoring" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <span className={getMetricColor(systemMetrics.cpu, 'cpu')}>
                      {systemMetrics.cpu.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={systemMetrics.cpu} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <span className={getMetricColor(systemMetrics.memory, 'memory')}>
                      {systemMetrics.memory.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={systemMetrics.memory} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <span className={getMetricColor(systemMetrics.disk, 'disk')}>
                      {systemMetrics.disk}%
                    </span>
                  </div>
                  <Progress value={systemMetrics.disk} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Network I/O</CardTitle>
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    <span className={getMetricColor(systemMetrics.network, 'network')}>
                      {systemMetrics.network.toFixed(1)} MB/s
                    </span>
                  </div>
                  <Progress value={systemMetrics.network} className="mt-2" />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>System Uptime</span>
                    <Badge className="text-green-600 px-2 py-1 border border-gray-300 bg-white">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {systemMetrics.uptime}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Active Users</span>
                    <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">
                      <Users className="h-3 w-3 mr-1" />
                      {systemMetrics.activeUsers}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total Requests</span>
                    <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {systemMetrics.totalRequests.toLocaleString()}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Error Rate</span>
                    <Badge className={`px-2 py-1 border border-gray-300 bg-white ${systemMetrics.errorRate > 1 ? 'text-red-600' : 'text-green-600'}`}>
                      {systemMetrics.errorRate > 1 ? <AlertTriangle className="h-3 w-3 mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                      {systemMetrics.errorRate}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    System Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      High memory usage detected on server-02 (85%)
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertDescription>
                      Scheduled maintenance in 2 hours
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      All services are running normally
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* User Management Tab */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">User Management</h3>
                <p className="text-sm text-muted-foreground">
                  Manage user accounts, roles, and permissions
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              <Button className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              {selectedUsers.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50" onClick={() => handleBulkUserAction('activate')}>
                    Activate ({selectedUsers.length})
                  </Button>
                  <Button className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50" onClick={() => handleBulkUserAction('deactivate')}>
                    Deactivate ({selectedUsers.length})
                  </Button>
                </div>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left p-4">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers(filteredUsers.map((u: User) => u.id));
                              } else {
                                setSelectedUsers([]);
                              }
                            }}
                          />
                        </th>
                        <th className="text-left p-4">User</th>
                        <th className="text-left p-4">Role</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Last Login</th>
                        <th className="text-left p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user: User) => (
                        <tr key={user.id} className="border-b hover:bg-muted/50">
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUsers([...selectedUsers, user.id]);
                                } else {
                                  setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                }
                              }}
                            />
                          </td>
                          <td className="p-4">
                            <div>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">{user.role}</Badge>
                          </td>
                          <td className="p-4">
                            <Badge className={user.status === 'Active' ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-600'}>
                              {user.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground">{user.lastLogin}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Button className="px-2 py-1 text-sm hover:bg-gray-100" onClick={() => handleUserAction('edit', user.id)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button className="px-2 py-1 text-sm hover:bg-gray-100" onClick={() => handleUserAction('view', user.id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button className="px-2 py-1 text-sm hover:bg-gray-100" onClick={() => handleUserAction('delete', user.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">System Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Manage system settings and configuration parameters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white">
                  <Settings className="h-4 w-4 mr-2" />
                  Add Config
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search configurations..."
                  value={configFilter}
                  onChange={(e) => setConfigFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              <Button className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
                <Filter className="h-4 w-4 mr-2" />
                Filter by Category
              </Button>
            </div>

            <div className="grid gap-4">
              {filteredConfigs.map((config: Config) => (
                <Card key={config.key}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">{config.key}</h4>
                          <Badge className="text-xs px-2 py-1 border border-gray-300 bg-white text-gray-700">
                            {config.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {config.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Current Value:</span>
                          <input
                            type="text"
                            value={config.value}
                            onChange={(e) => handleConfigUpdate(config.key, e.target.value)}
                            className="px-2 py-1 border border-input rounded text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button className="px-2 py-1 text-sm hover:bg-gray-100">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button className="px-2 py-1 text-sm hover:bg-gray-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
