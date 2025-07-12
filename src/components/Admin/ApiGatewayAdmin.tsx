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
  Lock
} from 'lucide-react';
import { apiGatewayService, type ApiEndpoint, type InternalNetwork, type ApiKey, type RateLimitRule } from '@/services/apiGateway/apiGatewayService';
import { toast } from 'sonner';

export const ApiGatewayAdmin: React.FC = () => {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Gateway Management</h1>
          <p className="text-muted-foreground">
            Manage API endpoints, access control, rate limiting, and analytics
          </p>
        </div>
        <Button onClick={seedDefaultEndpoints} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Seed Default Endpoints
        </Button>
      </div>

      <Tabs defaultValue="endpoints" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="endpoints" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Endpoints
          </TabsTrigger>
          <TabsTrigger value="networks" className="flex items-center gap-2">
            <Network className="h-4 w-4" />
            Networks
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="rate-limits" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Rate Limits
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>
                Configure public and internal access for API endpoints
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
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Rate Limit</TableHead>
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
                          {endpoint.rate_limit_per_minute} req/min
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
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Manage API keys for external access
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
              <div className="space-y-4">
                {apiKeys.map((apiKey) => (
                  <div key={apiKey.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{apiKey.key_name}</h4>
                      <p className="text-sm text-muted-foreground font-mono">
                        {apiKey.api_key.substring(0, 20)}...
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={apiKey.is_active ? "default" : "secondary"}>
                          {apiKey.is_active ? "Active" : "Revoked"}
                        </Badge>
                        {apiKey.rate_limit_override && (
                          <Badge variant="outline">
                            {apiKey.rate_limit_override} req/min
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyApiKey(apiKey.api_key)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {apiKey.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeApiKey(apiKey.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rate Limits Tab */}
        <TabsContent value="rate-limits" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Rate Limit Rules</CardTitle>
                <CardDescription>
                  Configure custom rate limits for specific IPs, CIDRs, or users
                </CardDescription>
              </div>
              <Dialog open={createRuleOpen} onOpenChange={setCreateRuleOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Rule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Rate Limit Rule</DialogTitle>
                    <DialogDescription>
                      Define a custom rate limit rule
                    </DialogDescription>
                  </DialogHeader>
                  <CreateRateLimitForm 
                    onSuccess={() => {
                      setCreateRuleOpen(false);
                      loadData();
                    }}
                  />
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {rateLimitRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{rule.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {rule.target_type}: {rule.target_value}
                      </p>
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Analytics</CardTitle>
              <CardDescription>
                Monitor API usage, rate limiting, and performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Activity className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Analytics Dashboard</h3>
                <p className="text-muted-foreground">
                  Coming soon - Real-time API usage analytics and monitoring
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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