import React, { useState, useEffect } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  Key,
  Activity,
  Copy,
  Check,
  Settings,
  Loader2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/core/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  apiGatewayService,
  type ApiKey,
} from '@/services/apiGateway/apiGatewayService';
import { supabase } from '@/integrations/supabase/client';
import { statusTone } from '@/utils/statusTone';

import { GlobalAdminHeader } from './GlobalAdminHeader';

interface ApiGatewayAdminProps {
  /** When embedded as a tab (e.g. in AI Configurations), hide the page header. */
  embedded?: boolean;
}

export const ApiGatewayAdmin: React.FC<ApiGatewayAdminProps> = ({ embedded = false }) => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setSelectedApiKey] = useState<ApiKey | null>(null);

  // API Key generation
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyUserId, setNewKeyUserId] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Analytics
  const [analyticsData, setAnalyticsData] = useState<{
    totalRequests: number;
    successfulRequests: number;
    rateLimitedRequests: number;
    avgResponseTime: number;
    topEndpoints: Array<{ path: string; count: number }>;
    recentLogs: Array<{ request_path: string; request_method: string; response_status: number | null; response_time_ms: number | null; created_at: string | null; ip_address: string | null }>;
  }>({
    totalRequests: 0, successfulRequests: 0, rateLimitedRequests: 0, avgResponseTime: 0,
    topEndpoints: [], recentLogs: [],
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [recentLogsPage, setRecentLogsPage] = useState(1);

  // Users for key generation
  const [users, setUsers] = useState<Array<{ id: string; full_name: string | null }>>([]);

  useEffect(() => {
    loadData();
    loadAnalytics();
    loadUsers();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const apiKeysData = await apiGatewayService.getAllApiKeys();
      setApiKeys(apiKeysData);
    } catch (error) {
      console.error('Error loading API Gateway data:', error);
      toast.error('Failed to load API Gateway data');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const logs = await apiGatewayService.getApiUsageLogs({ limit: 500 });
      const totalRequests = logs.length;
      const successfulRequests = logs.filter((l) => (l.response_status ?? 0) >= 200 && (l.response_status ?? 0) < 400).length;
      const rateLimitedRequests = logs.filter((l) => l.response_status === 429).length;
      const times = logs.map((l) => l.response_time_ms).filter((t): t is number => t != null);
      const avgResponseTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

      const endpointCounts: Record<string, number> = {};
      logs.forEach((l) => { endpointCounts[l.request_path] = (endpointCounts[l.request_path] || 0) + 1; });
      const topEndpoints = Object.entries(endpointCounts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setAnalyticsData({
        totalRequests, successfulRequests, rateLimitedRequests, avgResponseTime,
        topEndpoints,
        // Keep every fetched log — the table pages through them rather than
        // dropping all but the newest 20 before they ever reach the render.
        recentLogs: logs,
      });
      setRecentLogsPage(1);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .order('full_name', { ascending: true })
        .limit(200);
      if (data) {
        setUsers(data.map((u: { user_id: string; full_name: string | null }) => ({
          id: u.user_id,
          full_name: u.full_name,
        })));
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleGenerateKey = async () => {
    if (!newKeyName.trim() || !newKeyUserId) return;
    setGeneratingKey(true);
    try {
      const key = await apiGatewayService.generateApiKey(newKeyUserId, newKeyName.trim());
      setApiKeys((prev) => [key, ...prev]);
      setNewKeyName('');
      setNewKeyUserId('');
      setShowGenerateForm(false);
      setRevealedKeyId(key.id);
      toast.success('API key generated. Copy it now — it won\'t be shown in full again.');
    } catch {
      toast.error('Failed to generate API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      await apiGatewayService.revokeApiKey(id);
      setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, is_active: false } : k));
      toast.success('API key revoked');
    } catch {
      toast.error('Failed to revoke key');
    }
  };

  const handleCopyKey = (key: ApiKey) => {
    navigator.clipboard.writeText(key.api_key);
    setCopiedKeyId(key.id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const maskKey = (key: string) => key.length <= 8 ? key : key.slice(0, 4) + '••••••••••••••••' + key.slice(-4);

  if (loading) {
    return (
      <div className="min-h-screen">
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
    <div className={embedded ? '' : 'min-h-screen'}>
      {!embedded && (
        <GlobalAdminHeader
          title="API Gateway Management"
          description="Manage API keys and monitor API usage"
          breadcrumbs={[
            { label: 'Admin', path: '/admin' },
            { label: 'API Gateway' },
          ]}
        />
      )}

      <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
        <Tabs defaultValue="api-keys" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>API Keys</CardTitle>
                    <CardDescription>Generate and manage API keys for external access</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowGenerateForm((v) => !v)}>
                    <Plus className="h-4 w-4 mr-1.5" />Generate Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showGenerateForm && (
                  <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Key Name</Label>
                        <Input
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder="e.g. Production, Testing, Partner…"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>User</Label>
                        <Select value={newKeyUserId} onValueChange={setNewKeyUserId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select user…" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name || u.id.slice(0, 8) + '…'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setShowGenerateForm(false); setNewKeyName(''); setNewKeyUserId(''); }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleGenerateKey} disabled={!newKeyName.trim() || !newKeyUserId || generatingKey}>
                        {generatingKey ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                        Generate Key
                      </Button>
                    </div>
                  </div>
                )}

                {apiKeys.length === 0 ? (
                  <div className="text-center py-8">
                    <Key className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No API Keys</h3>
                    <p className="text-muted-foreground">Click "Generate Key" to create your first API key.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div key={key.id} className={`flex items-center justify-between p-4 border rounded-lg ${key.is_active ? '' : 'opacity-60 bg-muted/30'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm">{key.key_name}</h4>
                            <span className={`text-xs capitalize ${statusTone(key.is_active ? 'active' : 'revoked')}`}>
                              {key.is_active ? 'Active' : 'Revoked'}
                            </span>
                            {key.rate_limit_override && (
                              <Badge variant="outline" className="text-xs">{key.rate_limit_override} req/min</Badge>
                            )}
                          </div>
                          <p className="text-sm font-mono text-muted-foreground">
                            {key.is_active
                              ? (revealedKeyId === key.id ? key.api_key : maskKey(key.api_key))
                              : '— revoked —'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Created {new Date(key.created_at).toLocaleDateString()}
                            {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                            {key.expires_at && ` · Expires ${new Date(key.expires_at).toLocaleDateString()}`}
                            {key.user_id && ` · User: ${key.user_id.slice(0, 8)}…`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          {key.is_active && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRevealedKeyId(revealedKeyId === key.id ? null : key.id)}>
                                {revealedKeyId === key.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyKey(key)}>
                                {copiedKeyId === key.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                              </Button>
                            </>
                          )}
                          <Sheet>
                            <SheetTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedApiKey(key)}>
                                <Settings className="h-4 w-4" />
                              </Button>
                            </SheetTrigger>
                            <SheetContent>
                              <SheetHeader>
                                <SheetTitle>Key Settings</SheetTitle>
                                <SheetDescription>Configure {key.key_name}</SheetDescription>
                              </SheetHeader>
                              <div className="mt-6 space-y-4">
                                <div className="space-y-2">
                                  <Label>Rate Limit Override</Label>
                                  <Input type="number" placeholder="Custom rate limit (req/min)" defaultValue={key.rate_limit_override || ''} />
                                  <p className="text-xs text-muted-foreground">Leave empty for default limits</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Expiration Date</Label>
                                  <Input type="datetime-local" defaultValue={key.expires_at ? new Date(key.expires_at).toISOString().slice(0, 16) : ''} />
                                </div>
                                <div className="flex gap-2">
                                  <Button className="flex-1">Update</Button>
                                  <Button variant="outline" className="flex-1">Reset</Button>
                                </div>
                              </div>
                            </SheetContent>
                          </Sheet>
                          {key.is_active && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRevokeKey(key.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={loadAnalytics} disabled={analyticsLoading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analyticsData.totalRequests.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{analyticsData.successfulRequests} successful</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Active API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{apiKeys.filter((k) => k.is_active).length}</div>
                  <p className="text-xs text-muted-foreground">{apiKeys.length} total</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Rate Limit Hits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analyticsData.rateLimitedRequests}</div>
                  <p className="text-xs text-muted-foreground">429 responses</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analyticsData.avgResponseTime > 0 ? `${Math.round(analyticsData.avgResponseTime)}ms` : '—'}</div>
                  <p className="text-xs text-muted-foreground">Across all endpoints</p>
                </CardContent>
              </Card>
            </div>

            {analyticsData.topEndpoints.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top Endpoints</CardTitle>
                  <CardDescription>Most called API endpoints</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Endpoint</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsData.topEndpoints.map((ep) => (
                        <TableRow key={ep.path}>
                          <TableCell className="font-mono text-sm">{ep.path}</TableCell>
                          <TableCell className="text-right">{ep.count.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Recent API Activity</CardTitle>
                <CardDescription>Latest API requests (internal + external)</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {analyticsData.recentLogs.length > 0 ? (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Response</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginate(analyticsData.recentLogs, recentLogsPage).map((log, i) => (
                        // Absolute index — a per-page index collides across pages.
                        <TableRow key={(recentLogsPage - 1) * TABLE_PAGE_SIZE + i}>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">{log.request_path}</TableCell>
                          <TableCell><span className="text-xs font-mono text-muted-foreground">{log.request_method}</span></TableCell>
                          <TableCell>
                            <span className={`text-xs font-mono ${
                              (log.response_status ?? 0) >= 200 && (log.response_status ?? 0) < 300 ? 'text-emerald-600 dark:text-emerald-400'
                                : log.response_status === 429 ? 'text-amber-600 dark:text-amber-400'
                                : (log.response_status ?? 0) >= 400 ? 'text-red-500 dark:text-red-400'
                                : 'text-muted-foreground'
                            }`}>{log.response_status ?? '—'}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.response_time_ms != null ? `${log.response_time_ms}ms` : '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{log.ip_address || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    page={recentLogsPage}
                    total={analyticsData.recentLogs.length}
                    onPageChange={setRecentLogsPage}
                    label="requests"
                  />
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="mx-auto h-8 w-8 mb-2" />
                    <p>No API activity recorded yet</p>
                    <p className="text-xs mt-1">Internal and external API calls will appear here once logged</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
