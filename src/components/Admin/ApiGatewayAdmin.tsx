import React, { useState, useEffect } from 'react';
import {
  Settings,
  Search,
  Plus,
  Eye,
  Key,
  Activity,
  Network,

  Copy,
  CheckCircle,
  XCircle,
  Globe,
  Lock,
  Edit,
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGatewayService, type ApiEndpoint, type InternalNetwork, type ApiKey, type RateLimitRule } from '@/services/apiGateway/apiGatewayService';

import { GlobalAdminHeader } from './GlobalAdminHeader';


export const ApiGatewayAdmin: React.FC = () => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [, setInternalNetworks] = useState<InternalNetwork[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [, setRateLimitRules] = useState<RateLimitRule[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [endpointDetailsOpen, setEndpointDetailsOpen] = useState(false);
  const [, setSelectedApiKey] = useState<ApiKey | null>(null);

  // Global rate limits state
  const [globalRateLimits, setGlobalRateLimits] = useState({
    authentication: 20,
    materials: 60,
    recognition: 20,
    search: 60,
    admin: 10,
    analytics: 100,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [endpointsData, networksData, apiKeysData, rulesData] = await Promise.all([
        apiGatewayService.getAllEndpoints(),
        apiGatewayService.getAllInternalNetworks(),
        apiGatewayService.getAllApiKeys(),
        apiGatewayService.getAllRateLimitRules(),
      ]);

      setEndpoints(endpointsData);
      setInternalNetworks(networksData);
      setApiKeys(apiKeysData);
      setRateLimitRules(rulesData);
    } catch (error) {
      console.error('Error loading API Gateway data:', error);
      toast.error('Failed to load API Gateway data');
    } finally {
      setLoading(false);
    }
  };

  const toggleEndpointPublicAccess = async (endpointId: string, currentValue: boolean) => {
    try {
      await apiGatewayService.toggleEndpointPublicAccess(endpointId, !currentValue);
      setEndpoints(prev =>
        prev.map(ep =>
          ep.id === endpointId ? { ...ep, is_public: !currentValue } : ep,
        ),
      );
      toast.success(`Endpoint ${!currentValue ? 'enabled' : 'disabled'} for public access`);
    } catch (error) {
      console.error('Error toggling endpoint access:', error);
      toast.error('Failed to update endpoint access');
    }
  };

  const toggleEndpointInternalAccess = async (endpointId: string, currentValue: boolean) => {
    try {
      await apiGatewayService.toggleEndpointInternalAccess(endpointId, !currentValue);
      setEndpoints(prev =>
        prev.map(ep =>
          ep.id === endpointId ? { ...ep, is_internal: !currentValue } : ep,
        ),
      );
      toast.success(`Endpoint ${!currentValue ? 'enabled' : 'disabled'} for internal access`);
    } catch (error) {
      console.error('Error toggling internal access:', error);
      toast.error('Failed to update internal access');
    }
  };

  const updateEndpointRateLimit = async (endpointId: string, newLimit: number) => {
    try {
      setEndpoints(prev =>
        prev.map(ep =>
          ep.id === endpointId ? { ...ep, rate_limit_per_minute: newLimit } : ep,
        ),
      );
      toast.success('Rate limit updated');
    } catch (error) {
      console.error('Error updating rate limit:', error);
      toast.error('Failed to update rate limit');
    }
  };

  const updateGlobalRateLimit = async (category: string, newLimit: number) => {
    try {
      setGlobalRateLimits(prev => ({
        ...prev,
        [category]: newLimit,
      }));
      toast.success(`Global ${category} rate limit updated to ${newLimit} req/min`);
    } catch (error) {
      console.error('Error updating global rate limit:', error);
      toast.error('Failed to update global rate limit');
    }
  };

  const seedDefaultEndpoints = async () => {
    try {
      await apiGatewayService.seedDefaultEndpoints();
      await loadData();
      toast.success('Default endpoints seeded successfully');
    } catch (error) {
      console.error('Error seeding endpoints:', error);
      toast.error('Failed to seed default endpoints');
    }
  };

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied to clipboard');
  };

  const filteredEndpoints = endpoints.filter(endpoint => {
    const matchesSearch = endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         endpoint.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || endpoint.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(endpoints.map(ep => ep.category))).sort();

  const getEndpointResponseExample = (path: string) => {
    const examples: Record<string, string> = {
      '/api/materials': JSON.stringify({
        data: [
          { id: 'uuid', name: 'Material Name', category: 'metals', properties: {} },
        ],
        success: true,
      }, null, 2),
      '/api/recognition': JSON.stringify({
        data: {
          detected_materials: ['Steel', 'Aluminum'],
          confidence_score: 0.95,
          processing_time_ms: 1200,
        },
        success: true,
      }, null, 2),
      '/api/search': JSON.stringify({
        data: {
          results: [],
          total: 0,
          query_time_ms: 45,
        },
        success: true,
      }, null, 2),
    };

    return examples[path] || JSON.stringify({
      data: {},
      success: true,
      message: 'Operation completed successfully',
    }, null, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading API Gateway...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="API Gateway Management"
        description="Configure endpoints, access control, rate limiting, and monitoring"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'API Gateway' },
        ]}
      />

      {/* Main Content */}
      <div className="p-6 space-y-6">
        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="endpoints" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Endpoints & Rate Limits
            </TabsTrigger>
            <TabsTrigger value="networks" className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Networks
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Endpoints & Rate Limits Tab */}
          <TabsContent value="endpoints" className="space-y-4">
            {/* Global Rate Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Global Rate Limits by Category</CardTitle>
                <CardDescription>
                  Default rate limits applied to all endpoints by category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries({
                    authentication: { value: globalRateLimits.authentication, color: 'text-green-600', description: 'Login, register, tokens' },
                    materials: { value: globalRateLimits.materials, color: 'text-blue-600', description: 'CRUD operations' },
                    recognition: { value: globalRateLimits.recognition, color: 'text-orange-600', description: 'AI processing' },
                    search: { value: globalRateLimits.search, color: 'text-purple-600', description: 'Vector & text search' },
                    admin: { value: globalRateLimits.admin, color: 'text-red-600', description: 'Administrative ops' },
                    analytics: { value: globalRateLimits.analytics, color: 'text-cyan-600', description: 'Event tracking' },
                  }).map(([category, config]) => (
                    <div key={category} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className={`font-medium ${config.color}`}>
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </h4>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button className="text-gray-600 hover:text-gray-800 text-sm px-2 py-1">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit {category.charAt(0).toUpperCase() + category.slice(1)} Rate Limit</DialogTitle>
                              <DialogDescription>
                                Update the global rate limit for {category} endpoints
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="rateLimit">Rate Limit (requests/minute)</Label>
                                <Input
                                  id="rateLimit"
                                  type="number"
                                  defaultValue={config.value}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const newValue = parseInt((e.target as HTMLInputElement).value);
                                      if (!isNaN(newValue)) {
                                        updateGlobalRateLimit(category, newValue);
                                      }
                                    }
                                  }}
                                  placeholder="Enter rate limit"
                                />
                              </div>
                              <Button
                                onClick={(e) => {
                                  const input = (e.target as HTMLButtonElement).parentElement?.querySelector('input');
                                  if (input) {
                                    const newValue = parseInt(input.value);
                                    if (!isNaN(newValue)) {
                                      updateGlobalRateLimit(category, newValue);
                                    }
                                  }
                                }}
                                className="w-full"
                              >
                                Update Rate Limit
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <p className="text-2xl font-bold">{config.value} req/min</p>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* API Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle>API Endpoints</CardTitle>
                <CardDescription>
                  Configure individual endpoints, their rate limits, and public access costs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Search and Filter Controls */}
                <div className="flex gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search endpoints..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Endpoints Table */}
                {filteredEndpoints.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg">
                    <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No API Endpoints Found</h3>
                    <p className="text-muted-foreground mb-4">
                      Click &quot;Seed Default Endpoints&quot; to populate with default API endpoints
                    </p>
                    <Button onClick={seedDefaultEndpoints} className="border border-gray-300 px-4 py-2">
                      <Plus className="mr-2 h-4 w-4" />
                      Seed Default Endpoints
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Rate Limit</TableHead>
                          <TableHead>Cost per Call</TableHead>
                          <TableHead>Public Access</TableHead>
                          <TableHead>Internal Access</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEndpoints.map((endpoint) => (
                          <TableRow key={endpoint.id}>
                            <TableCell
                              className="font-mono text-sm cursor-pointer hover:text-blue-600"
                              onClick={() => {
                                setSelectedEndpoint(endpoint);
                                setEndpointDetailsOpen(true);
                              }}
                            >
                              {endpoint.path}
                            </TableCell>
                            <TableCell>
                              <Badge className="border border-gray-300 text-xs px-2 py-1">{endpoint.method}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-gray-100 text-gray-800 text-xs px-2 py-1">{endpoint.category}</Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {endpoint.description || 'No description'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Input
                                  type="number"
                                  value={endpoint.rate_limit_per_minute}
                                  onChange={(e) => {
                                    const newLimit = parseInt(e.target.value);
                                    if (!isNaN(newLimit)) {
                                      updateEndpointRateLimit(endpoint.id, newLimit);
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const newLimit = parseInt(e.target.value);
                                    if (!isNaN(newLimit)) {
                                      updateEndpointRateLimit(endpoint.id, newLimit);
                                    }
                                  }}
                                  className="w-20 h-8"
                                />
                                <span className="text-xs text-muted-foreground">req/min</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.001"
                                placeholder="$0.000"
                                className="w-20 h-8"
                                defaultValue="0.001"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={endpoint.is_public}
                                  onCheckedChange={() =>
                                    toggleEndpointPublicAccess(endpoint.id, endpoint.is_public)
                                  }
                                />
                                {endpoint.is_public ? (
                                  <Globe className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Lock className="h-4 w-4 text-gray-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={endpoint.is_internal}
                                  onCheckedChange={() =>
                                    toggleEndpointInternalAccess(endpoint.id, endpoint.is_internal)
                                  }
                                />
                                {endpoint.is_internal ? (
                                  <CheckCircle className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-gray-500" />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Keys & User Analytics</CardTitle>
                <CardDescription>
                  Manage API keys with user analytics and endpoint usage data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {apiKeys.length === 0 ? (
                  <div className="text-center py-8">
                    <Key className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No API Keys Generated</h3>
                    <p className="text-muted-foreground mb-4">
                      Generate API keys to enable external access to your APIs
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {apiKeys.map((apiKey) => (
                      <Card key={apiKey.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{apiKey.key_name}</h4>
                              <Badge className={apiKey.is_active ? 'bg-blue-100 text-blue-800 text-xs px-2 py-1' : 'bg-gray-100 text-gray-800 text-xs px-2 py-1'}>
                                {apiKey.is_active ? 'Active' : 'Revoked'}
                              </Badge>
                              {apiKey.rate_limit_override && (
                                <Badge className="border border-gray-300 text-xs px-2 py-1">
                                  {apiKey.rate_limit_override} req/min
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground font-mono mb-3">
                              {apiKey.api_key.substring(0, 20)}...
                            </p>

                            {/* User Analytics Summary */}
                            <div className="grid grid-cols-4 gap-4 mb-3">
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-semibold">0</div>
                                <div className="text-xs text-muted-foreground">Total Calls</div>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-semibold">0</div>
                                <div className="text-xs text-muted-foreground">This Month</div>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-semibold">$0.00</div>
                                <div className="text-xs text-muted-foreground">Total Cost</div>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-semibold">Never</div>
                                <div className="text-xs text-muted-foreground">Last Used</div>
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground">
                              Created: {new Date(apiKey.created_at).toLocaleDateString()}
                              {apiKey.expires_at && ` • Expires: ${new Date(apiKey.expires_at).toLocaleDateString()}`}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Sheet>
                              <SheetTrigger asChild>
                                <Button
                                  className="border border-gray-300 text-sm px-3 py-1"
                                  onClick={() => setSelectedApiKey(apiKey)}
                                >
                                  <Settings className="h-4 w-4 mr-1" />
                                  Rules
                                </Button>
                              </SheetTrigger>
                              <SheetContent>
                                <SheetHeader>
                                  <SheetTitle>Custom Rate Limit Rules</SheetTitle>
                                  <SheetDescription>
                                    Configure specific rate limit rules for {apiKey.key_name}
                                  </SheetDescription>
                                </SheetHeader>
                                <div className="mt-6 space-y-4">
                                  <div className="space-y-2">
                                    <Label>Override Global Rate Limit</Label>
                                    <Input
                                      type="number"
                                      placeholder="Enter custom rate limit"
                                      defaultValue={apiKey.rate_limit_override || ''}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Leave empty to use global rate limits
                                    </p>
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Allowed Endpoints</Label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                      {endpoints.map((endpoint) => (
                                        <div key={endpoint.id} className="flex items-center space-x-2">
                                          <input
                                            type="checkbox"
                                            id={`endpoint-${endpoint.id}`}
                                            defaultChecked={apiKey.allowed_endpoints?.includes(endpoint.id)}
                                            className="rounded"
                                          />
                                          <Label
                                            htmlFor={`endpoint-${endpoint.id}`}
                                            className="text-sm font-mono"
                                          >
                                            {endpoint.method} {endpoint.path}
                                          </Label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Expiration Date</Label>
                                    <Input
                                      type="datetime-local"
                                      defaultValue={apiKey.expires_at ? new Date(apiKey.expires_at).toISOString().slice(0, 16) : ''}
                                    />
                                  </div>

                                  <div className="flex space-x-2">
                                    <Button className="flex-1">
                                      Update Rules
                                    </Button>
                                    <Button className="flex-1 border border-gray-300 px-4 py-2">
                                      Reset to Default
                                    </Button>
                                  </div>
                                </div>
                              </SheetContent>
                            </Sheet>
                            <Button
                              className="border border-gray-300 text-sm px-3 py-1"
                              onClick={() => copyApiKey(apiKey.api_key)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              className="border border-gray-300 text-sm px-3 py-1"
                              onClick={() => {
                                // Toggle API key active status
                                console.log('Toggle API key status');
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">+0% from last month</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Active API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{apiKeys.filter(k => k.is_active).length}</div>
                  <p className="text-xs text-muted-foreground">Currently active</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Rate Limit Hits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">Rate limit exceeded</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0%</div>
                  <p className="text-xs text-muted-foreground">Last 24 hours</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent API Activity</CardTitle>
                <CardDescription>Latest API requests and their status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="mx-auto h-8 w-8 mb-2" />
                  <p>No recent API activity</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Endpoint Details Modal */}
        <Sheet open={endpointDetailsOpen} onOpenChange={setEndpointDetailsOpen}>
          <SheetContent className="w-[700px] sm:w-[800px]" side={'right' as const}>
            <SheetHeader>
              <SheetTitle>API Endpoint Details</SheetTitle>
              <SheetDescription>
                Detailed information about this API endpoint
              </SheetDescription>
            </SheetHeader>
            {selectedEndpoint && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Endpoint Path</h4>
                    <p className="font-mono text-lg">{selectedEndpoint.path}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Method</h4>
                      <Badge className="border border-gray-300 text-xs px-2 py-1 mt-1">{selectedEndpoint.method}</Badge>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Category</h4>
                      <Badge className="bg-gray-100 text-gray-800 text-xs px-2 py-1 mt-1">{selectedEndpoint.category}</Badge>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Description</h4>
                    <p className="text-sm">{selectedEndpoint.description || 'No description available'}</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <h3 className="text-lg font-semibold">Access Configuration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Public Access</span>
                        <Badge className={selectedEndpoint.is_public ? 'bg-blue-100 text-blue-800 text-xs px-2 py-1' : 'bg-gray-100 text-gray-800 text-xs px-2 py-1'}>
                          {selectedEndpoint.is_public ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedEndpoint.is_public ? 'Available to external users' : 'Internal access only'}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Internal Access</span>
                        <Badge className={selectedEndpoint.is_internal ? 'bg-blue-100 text-blue-800 text-xs px-2 py-1' : 'bg-gray-100 text-gray-800 text-xs px-2 py-1'}>
                          {selectedEndpoint.is_internal ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedEndpoint.is_internal ? 'Available to internal networks' : 'No internal access'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <h3 className="text-lg font-semibold">Rate Limiting</h3>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Current Rate Limit</span>
                      <Badge className="border border-gray-300 text-xs px-2 py-1">{selectedEndpoint.rate_limit_per_minute} req/min</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Maximum requests allowed per minute for this endpoint
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <h3 className="text-lg font-semibold">Response Format</h3>
                  <div className="p-4 border rounded-lg bg-muted/50">
                    <h4 className="font-medium text-sm mb-2">Expected Response</h4>
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {getEndpointResponseExample(selectedEndpoint.path)}
                    </pre>
                  </div>
                </div>

                <div className="grid gap-4">
                  <h3 className="text-lg font-semibold">Usage Statistics</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 border rounded-lg">
                      <div className="text-lg font-semibold">0</div>
                      <div className="text-xs text-muted-foreground">Total Calls</div>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <div className="text-lg font-semibold">0ms</div>
                      <div className="text-xs text-muted-foreground">Avg Response Time</div>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <div className="text-lg font-semibold">0%</div>
                      <div className="text-xs text-muted-foreground">Error Rate</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};
