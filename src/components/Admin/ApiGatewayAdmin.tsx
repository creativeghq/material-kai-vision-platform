
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Settings, 
  Search, 
  Plus, 
  Eye, 
  Key, 
  Shield, 
  Activity, 
  Network, 
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  Globe,
  Lock,
  ArrowLeft,
  Home,
  Edit
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiGatewayService, type ApiEndpoint, type InternalNetwork, type ApiKey, type RateLimitRule } from '@/services/apiGateway/apiGatewayService';
import { toast } from 'sonner';

export const ApiGatewayAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [internalNetworks, setInternalNetworks] = useState<InternalNetwork[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [rateLimitRules, setRateLimitRules] = useState<RateLimitRule[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // State for dialogs
  const [createNetworkOpen, setCreateNetworkOpen] = useState(false);
  const [createApiKeyOpen, setCreateApiKeyOpen] = useState(false);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);

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
          ep.id === endpointId ? { ...ep, is_public: !currentValue } : ep
        )
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
          ep.id === endpointId ? { ...ep, is_internal: !currentValue } : ep
        )
      );
      toast.success(`Endpoint ${!currentValue ? 'enabled' : 'disabled'} for internal access`);
    } catch (error) {
      console.error('Error toggling endpoint access:', error);
      toast.error('Failed to update endpoint access');
    }
  };

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied to clipboard');
  };

  const revokeApiKey = async (id: string) => {
    try {
      await apiGatewayService.revokeApiKey(id);
      setApiKeys(prev => 
        prev.map(key => 
          key.id === id ? { ...key, is_active: false } : key
        )
      );
      toast.success('API key revoked');
    } catch (error) {
      console.error('Error revoking API key:', error);
      toast.error('Failed to revoke API key');
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

  const filteredEndpoints = endpoints.filter(endpoint => {
    const matchesSearch = endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         endpoint.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || endpoint.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(endpoints.map(ep => ep.category))).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Loading API Gateway...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">API Gateway Management</h1>
              <p className="text-sm text-muted-foreground">
                Manage API endpoints, access control, rate limiting, and analytics
              </p>
            </div>
          </div>
          <Button onClick={seedDefaultEndpoints} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Seed Default Endpoints
          </Button>
        </div>
      </div>

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
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-green-600">Authentication</h4>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold">20 req/min</p>
                    <p className="text-sm text-muted-foreground">Login, register, tokens</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-blue-600">Materials</h4>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold">60 req/min</p>
                    <p className="text-sm text-muted-foreground">CRUD operations</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-orange-600">Recognition</h4>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold">20 req/min</p>
                    <p className="text-sm text-muted-foreground">AI processing</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-purple-600">Search</h4>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold">60 req/min</p>
                    <p className="text-sm text-muted-foreground">Vector & text search</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-red-600">Admin</h4>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold">10 req/min</p>
                    <p className="text-sm text-muted-foreground">Administrative ops</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-cyan-600">Analytics</h4>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold">100 req/min</p>
                    <p className="text-sm text-muted-foreground">Event tracking</p>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                      Click "Seed Default Endpoints" to populate with default API endpoints
                    </p>
                    <Button onClick={seedDefaultEndpoints} variant="outline">
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
                            <TableCell className="font-mono text-sm">
                              {endpoint.path}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{endpoint.method}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{endpoint.category}</Badge>
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
                                    // Handle rate limit update
                                    console.log('Update rate limit for', endpoint.path, 'to', e.target.value);
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

          {/* Internal Networks Tab */}
          <TabsContent value="networks" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Internal Networks</CardTitle>
                  <CardDescription>
                    Define CIDR ranges that should be considered internal networks
                  </CardDescription>
                </div>
                <Dialog open={createNetworkOpen} onOpenChange={setCreateNetworkOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Network
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Internal Network</DialogTitle>
                      <DialogDescription>
                        Define a new internal network CIDR range
                      </DialogDescription>
                    </DialogHeader>
                    <CreateNetworkForm 
                      onSuccess={() => {
                        setCreateNetworkOpen(false);
                        loadData();
                      }}
                    />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {internalNetworks.map((network) => (
                    <div key={network.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{network.name}</h4>
                        <p className="text-sm text-muted-foreground">{network.cidr_range}</p>
                        {network.description && (
                          <p className="text-sm text-muted-foreground mt-1">{network.description}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={network.is_active ? "default" : "secondary"}>
                          {network.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => apiGatewayService.deleteInternalNetwork(network.id).then(loadData)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>API Keys & User Analytics</CardTitle>
                  <CardDescription>
                    Manage API keys with user analytics and endpoint usage data
                  </CardDescription>
                </div>
                <Dialog open={createApiKeyOpen} onOpenChange={setCreateApiKeyOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Generate API Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Generate API Key</DialogTitle>
                      <DialogDescription>
                        Create a new API key for external access
                      </DialogDescription>
                    </DialogHeader>
                    <CreateApiKeyForm 
                      onSuccess={() => {
                        setCreateApiKeyOpen(false);
                        loadData();
                      }}
                    />
                  </DialogContent>
                </Dialog>
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
                              <Badge variant={apiKey.is_active ? "default" : "secondary"}>
                                {apiKey.is_active ? "Active" : "Revoked"}
                              </Badge>
                              {apiKey.rate_limit_override && (
                                <Badge variant="outline">
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyApiKey(apiKey.api_key)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Sheet>
                              <SheetTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                >
                                  <Shield className="h-4 w-4" />
                                </Button>
                              </SheetTrigger>
                              <SheetContent className="w-[600px] sm:w-[800px]">
                                <SheetHeader>
                                  <SheetTitle>Custom Rate Limit Rules - {apiKey.key_name}</SheetTitle>
                                  <SheetDescription>
                                    Override default rate limits for this API key
                                  </SheetDescription>
                                </SheetHeader>
                                <div className="mt-6 space-y-4">
                                  <div className="flex justify-between items-center">
                                    <h4 className="font-medium">Active Custom Rules</h4>
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <Button size="sm">
                                          <Plus className="mr-2 h-4 w-4" />
                                          Add Rule
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent>
                                        <DialogHeader>
                                          <DialogTitle>Create Custom Rate Limit Rule</DialogTitle>
                                          <DialogDescription>
                                            Override the default rate limit for this API key
                                          </DialogDescription>
                                        </DialogHeader>
                                        <CreateRateLimitForm 
                                          onSuccess={() => {
                                            loadData();
                                          }}
                                        />
                                      </DialogContent>
                                    </Dialog>
                                  </div>
                                  
                                  {/* Custom Rules List */}
                                  <div className="space-y-3">
                                    {rateLimitRules
                                      .filter(rule => rule.target_value === apiKey.api_key)
                                      .map((rule) => (
                                      <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div>
                                          <h5 className="font-medium">{rule.name}</h5>
                                          <p className="text-sm text-muted-foreground">
                                            {rule.requests_per_minute} requests per minute
                                          </p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <Badge variant={rule.is_active ? "default" : "secondary"}>
                                            {rule.is_active ? "Active" : "Inactive"}
                                          </Badge>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => apiGatewayService.deleteRateLimitRule(rule.id).then(loadData)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                    
                                    {rateLimitRules.filter(rule => rule.target_value === apiKey.api_key).length === 0 && (
                                      <div className="text-center py-8 text-muted-foreground">
                                        <Shield className="mx-auto h-8 w-8 mb-2" />
                                        <p>No custom rules configured</p>
                                        <p className="text-sm">This API key uses default rate limits</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </SheetContent>
                            </Sheet>
                            {apiKey.is_active && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revokeApiKey(apiKey.id)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
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
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">+0% from last month</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Internal Requests</CardTitle>
                  <Network className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">From internal networks</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">External Requests</CardTitle>
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">From external sources</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Rate Limited</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">0</div>
                  <p className="text-xs text-muted-foreground">Blocked requests</p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Analytics */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Endpoints</CardTitle>
                  <CardDescription>Most frequently accessed endpoints</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="mx-auto h-8 w-8 mb-2" />
                      <p>No usage data available</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Request Sources</CardTitle>
                  <CardDescription>Internal vs External traffic breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center py-8 text-muted-foreground">
                      <Network className="mx-auto h-8 w-8 mb-2" />
                      <p>No traffic data available</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent API Activity</CardTitle>
                <CardDescription>Latest API requests and responses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="mx-auto h-12 w-12 mb-4" />
                  <h3 className="text-lg font-semibold">No Recent Activity</h3>
                  <p>API requests will appear here once traffic starts flowing</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Helper Components for Forms
const CreateNetworkForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [cidrRange, setCidrRange] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiGatewayService.createInternalNetwork({
        name,
        cidr_range: cidrRange,
        description,
        is_active: true,
      });
      toast.success('Internal network created');
      onSuccess();
    } catch (error) {
      console.error('Error creating network:', error);
      toast.error('Failed to create internal network');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Office Network"
          required
        />
      </div>
      <div>
        <Label htmlFor="cidr">CIDR Range</Label>
        <Input
          id="cidr"
          value={cidrRange}
          onChange={(e) => setCidrRange(e.target.value)}
          placeholder="e.g., 192.168.1.0/24"
          required
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </div>
      <Button type="submit" className="w-full">Create Network</Button>
    </form>
  );
};

const CreateApiKeyForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [keyName, setKeyName] = useState('');
  const [rateLimit, setRateLimit] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiGatewayService.generateApiKey('system', keyName, {
        rateLimit: rateLimit ? parseInt(rateLimit) : undefined,
      });
      toast.success('API key generated');
      onSuccess();
    } catch (error) {
      console.error('Error generating API key:', error);
      toast.error('Failed to generate API key');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="keyName">Key Name</Label>
        <Input
          id="keyName"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="e.g., Mobile App Key"
          required
        />
      </div>
      <div>
        <Label htmlFor="rateLimit">Rate Limit (requests/minute)</Label>
        <Input
          id="rateLimit"
          type="number"
          value={rateLimit}
          onChange={(e) => setRateLimit(e.target.value)}
          placeholder="Leave empty for default"
        />
      </div>
      <Button type="submit" className="w-full">Generate API Key</Button>
    </form>
  );
};

const CreateRateLimitForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<'ip' | 'cidr' | 'user' | 'api_key'>('ip');
  const [targetValue, setTargetValue] = useState('');
  const [requestsPerMinute, setRequestsPerMinute] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiGatewayService.createRateLimitRule({
        name,
        target_type: targetType,
        target_value: targetValue,
        requests_per_minute: parseInt(requestsPerMinute),
        is_active: true,
      });
      toast.success('Rate limit rule created');
      onSuccess();
    } catch (error) {
      console.error('Error creating rate limit rule:', error);
      toast.error('Failed to create rate limit rule');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="ruleName">Rule Name</Label>
        <Input
          id="ruleName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., High Volume Client"
          required
        />
      </div>
      <div>
        <Label htmlFor="targetType">Target Type</Label>
        <Select value={targetType} onValueChange={(value: any) => setTargetType(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ip">IP Address</SelectItem>
            <SelectItem value="cidr">CIDR Range</SelectItem>
            <SelectItem value="user">User ID</SelectItem>
            <SelectItem value="api_key">API Key</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="targetValue">Target Value</Label>
        <Input
          id="targetValue"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          placeholder={
            targetType === 'ip' ? 'e.g., 192.168.1.100' :
            targetType === 'cidr' ? 'e.g., 10.0.0.0/8' :
            targetType === 'user' ? 'e.g., user-uuid' :
            'e.g., api-key-value'
          }
          required
        />
      </div>
      <div>
        <Label htmlFor="requestsPerMinute">Requests per Minute</Label>
        <Input
          id="requestsPerMinute"
          type="number"
          value={requestsPerMinute}
          onChange={(e) => setRequestsPerMinute(e.target.value)}
          placeholder="e.g., 100"
          required
        />
      </div>
      <Button type="submit" className="w-full">Create Rule</Button>
    </form>
  );
};
