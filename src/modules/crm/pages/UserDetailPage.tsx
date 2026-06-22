import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Shield,
  CreditCard,
  Calendar,
  User,
  Save,
  Edit2,
  Key,
  Activity,
  FileText,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { usersAPI, contactsAPI } from '@/services/crm.service';
import { supabase } from '@/integrations/supabase/client';
import { CategoryAssignmentPicker } from '@/components/business/catalogs/CategoryAssignmentPicker';
import { AdminRoleUpgradeRequestsPanel } from '@/modules/crm/components/AdminRoleUpgradeRequestsPanel';
import { PROFESSIONAL_TYPE_LABELS } from '@/lib/materialCategories';
import { crmCategoriesService } from '@/services/crmCategoriesService';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  role_id?: string;
  subscription_tier?: string;
  status?: string;
  professional_type?: string | null;
  credits?: number;
  created_at: string;
  roles?: { id: string; name: string; level: number };
  user_profiles?: {
    full_name?: string;
    avatar_url?: string;
    phone?: string;
    company?: string;
    job_title?: string;
  };
}

interface AIUsageLog {
  id: string;
  operation_type: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  raw_cost_usd?: number;
  billed_cost_usd: number;
  credits_debited: number;
  created_at: string;
}

interface AIUsageTotals {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_raw_cost_usd: number;
  total_billed_cost_usd: number;
  total_credits_debited: number;
}

interface ModelUsage {
  model: string;
  calls: number;
  cost: number;
  credits: number;
}

const AIUsageTab: React.FC<{ userId: string }> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<AIUsageLog[]>([]);
  const [totals, setTotals] = useState<AIUsageTotals | null>(null);
  const [byModel, setByModel] = useState<ModelUsage[]>([]);

  useEffect(() => {
    const fetchAIUsage = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api/users/${userId}/ai-usage`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const result = await response.json();
            setUsage(result.data?.usage || []);
            setTotals(result.data?.totals || null);
            setByModel(result.data?.byModel || []);
          }
        }
      } catch (error) {
        console.error('Error fetching AI usage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAIUsage();
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading AI usage data...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600">
              ${(totals?.total_billed_cost_usd || 0).toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">Total AI Cost (Billed)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {(totals?.total_credits_debited || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Credits Used</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totals?.total_calls || 0}</div>
            <p className="text-xs text-muted-foreground">Total API Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {((totals?.total_input_tokens || 0) + (totals?.total_output_tokens || 0)).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Total Tokens</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Model */}
      {byModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byModel.map((m) => (
                <div key={m.model} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{m.model}</p>
                    <p className="text-xs text-muted-foreground">{m.calls} calls</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-600">${(m.cost ?? 0).toFixed(4)}</p>
                    <p className="text-xs text-muted-foreground">{(m.credits ?? 0).toFixed(2)} credits</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Usage Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent AI Operations</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No AI usage recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {usage.slice(0, 20).map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg text-sm">
                  <div>
                    <p className="font-medium">{log.operation_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.model_name} • {log.input_tokens + log.output_tokens} tokens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-600">
                      ${(log.billed_cost_usd || 0).toFixed(6)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface Role {
  id: string;
  name: string;
  level: number;
}

interface LinkedContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

/**
 * User Detail Page
 * Full page view for managing a platform user with comprehensive information
 */
export const UserDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [linkedContact, setLinkedContact] = useState<LinkedContact | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [roleId, setRoleId] = useState('');
  const [subscriptionTier, setSubscriptionTier] = useState('free');
  const [status, setStatus] = useState('active');
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    // Load roles and user in parallel
    try {
      const [rolesResult] = await Promise.all([
        loadRoles(),
        loadUser(),
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, level')
        .order('level', { ascending: true });

      if (error) throw error;
      setRoles(data || []);
      return data || [];
    } catch (error) {
      console.error('Error loading roles:', error);
      return [];
    }
  };

  const loadUser = async () => {
    if (!id) return;
    try {
      const response = await usersAPI.getUser(id);
      // Handle both response.data and direct response formats
      const userData = response.data || response;

      console.log('User data loaded:', userData); // Debug log

      if (!userData) {
        setError('User not found');
        return;
      }

      setUser(userData);

      // Set editable fields from the user data
      setRoleId(userData.role_id || '');
      setSubscriptionTier(userData.subscription_tier || 'free');
      setStatus(userData.status || 'active');
      setCredits(userData.credits || 0);

      // Try to load linked contact
      try {
        const contactResponse = await contactsAPI.getContactByUserId(id);
        if (contactResponse.data) {
          setLinkedContact(contactResponse.data);
        }
      } catch {
        // No linked contact found, that's okay
        setLinkedContact(null);
      }
    } catch (err: any) {
      console.error('Error loading user:', err);
      setError(err.message || 'Failed to load user details');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load user details',
        variant: 'destructive',
      });
    }
  };

  /**
   * Inline-save an admin classification field on user_profiles. Optimistic
   * update + revert on failure. After professional_type changes we also
   * trigger the auto-sync RPC so the user's crm_categories membership picks
   * up the new value immediately (the resync is otherwise only run from the
   * Categories admin page).
   */
  const patchInlineUser = async (updates: { role_id?: string; status?: string; professional_type?: string | null }) => {
    if (!user || !id) return;
    let snapshot: UserProfile | null = null;
    setUser((prev) => { snapshot = prev; return prev ? { ...prev, ...updates } : prev; });
    try {
      await usersAPI.updateUser(id, updates);
      if ('professional_type' in updates) {
        try { await crmCategoriesService.resyncAuto(); } catch (e) {
          console.warn('Category auto-resync after professional_type change failed:', e);
        }
      }
    } catch (error) {
      console.error('Inline patch failed:', error);
      if (snapshot) setUser(snapshot);
      toast({
        title: 'Could not save',
        description: error instanceof Error ? error.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async () => {
    if (!user || !id) return;

    try {
      setSaving(true);

      // Update user profile
      await usersAPI.updateUser(id, {
        role_id: roleId,
        subscription_tier: subscriptionTier,
        status: status,
      });

      // Update credits if changed
      if (credits !== user.credits) {
        await supabase
          .from('user_credits')
          .upsert({
            user_id: id,
            balance: credits,
          }, {
            onConflict: 'user_id',
          });
      }

      toast({
        title: 'Success',
        description: 'User updated successfully',
      });
      setEditing(false);
      await loadUser();
    } catch (error) {
      console.error('Error saving user:', error);
      toast({
        title: 'Error',
        description: 'Failed to save user',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Password reset email sent',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reset email',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (userStatus: string) => {
    const statusConfig: Record<string, { className: string }> = {
      active: { className: 'bg-green-100 text-green-800' },
      inactive: { className: 'bg-gray-100 text-gray-800' },
      suspended: { className: 'bg-red-100 text-red-800' },
    };
    const config = statusConfig[userStatus] || statusConfig.inactive;
    return <Badge className={config.className}>{userStatus}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Loading..."
          description="Fetching user details"
          badge="CRM"
        />
        <div className="p-6">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CRM
          </Button>
          <div className="text-center py-12">Loading user details...</div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="User Not Found"
          description={error || 'The requested user could not be found'}
          badge="CRM"
        />
        <div className="p-6">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CRM
          </Button>
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg">
              <p className="font-medium">Error Details:</p>
              <p className="text-sm">{error}</p>
              <p className="text-xs mt-2 text-muted-foreground">User ID: {id}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title={user.email}
        description={`User Details • ${user.roles?.name || 'No role'}`}
        badge="CRM"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" onClick={() => navigate('/admin/crm')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to CRM
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleResetPassword}>
              <Key className="h-4 w-4 mr-2" />
              Reset Password
            </Button>
            {editing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    loadUser();
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit User
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">
              <User className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="subscription">
              <CreditCard className="h-4 w-4 mr-2" />
              Subscription & Credits
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="ai-usage">
              <FileText className="h-4 w-4 mr-2" />
              AI Usage
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-4 w-4" />
                    User Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Email</Label>
                    <div className="flex items-center gap-2 mt-1 p-2 bg-muted/30 rounded-lg">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{user.email}</span>
                    </div>
                  </div>
                  {user.user_profiles?.full_name && (
                    <div>
                      <Label>Full Name</Label>
                      <div className="flex items-center gap-2 mt-1 p-2 bg-muted/30 rounded-lg">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{user.user_profiles.full_name}</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>User ID</Label>
                    <div className="mt-1 p-2 bg-muted/30 rounded-lg overflow-x-auto">
                      <code className="text-xs break-all">{user.user_id}</code>
                    </div>
                  </div>
                  <div>
                    <Label>Status</Label>
                    {editing ? (
                      <Select value={status || 'active'} onValueChange={setStatus}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1">{getStatusBadge(status || user.status || 'active')}</div>
                    )}
                  </div>
                  <div>
                    <Label>Created</Label>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {new Date(user.created_at).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* item 6 — Role & Permissions and the Linked CRM Contact stack in the
                  right column so the contact sits directly under the role card. */}
              <div className="space-y-6">
              {/* Role & Permissions Card — Role + Professional type are
                  admin classifications, both inline-editable (no "Edit" mode
                  required). Professional type drives the auto-synced CRM
                  category for this user. */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4" />
                    Role & Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="user-role">Role</Label>
                    <Select
                      value={user.role_id || ''}
                      onValueChange={(v) => patchInlineUser({ role_id: v })}
                    >
                      <SelectTrigger id="user-role" className="mt-1">
                        <SelectValue placeholder="Select role...">
                          {user.role_id && roles.length > 0
                            ? roles.find(r => r.id === user.role_id)?.name || 'Select role...'
                            : 'Select role...'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              {role.name} (Level {role.level})
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Role determines platform permissions and access levels.
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Label htmlFor="user-prof-type">Professional Type (Category)</Label>
                    <Select
                      value={user.professional_type ?? '__unset'}
                      onValueChange={(v) =>
                        patchInlineUser({ professional_type: v === '__unset' ? null : v })
                      }
                    >
                      <SelectTrigger id="user-prof-type" className="mt-1">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset">Not set</SelectItem>
                        {Object.entries(PROFESSIONAL_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Drives the auto-synced CRM category. Re-syncs the user's category
                      membership immediately on change.
                    </p>
                  </div>
                </CardContent>
              </Card>

            {/* item 6 — Linked CRM Contact now sits directly under Role & Permissions. */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  Linked CRM Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                {linkedContact ? (
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium">{linkedContact.name}</p>
                      {linkedContact.email && (
                        <p className="text-sm text-muted-foreground">{linkedContact.email}</p>
                      )}
                      {linkedContact.company && (
                        <p className="text-sm text-muted-foreground">{linkedContact.company}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/crm/contacts/${linkedContact.id}`)}
                    >
                      View Contact
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No CRM contact linked to this user</p>
                    <p className="text-xs mt-1">
                      Link a contact from the Contacts page to associate customer information
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
              </div>
            </div>

            <CategoryAssignmentPicker target={{ kind: 'user', id: user.user_id }} />

            {/* Role Upgrade Requests — applications for dealer/factory promotion */}
            <AdminRoleUpgradeRequestsPanel
              userId={user.user_id}
              onUpdated={() => loadUser()}
            />
          </TabsContent>

          {/* Subscription & Credits Tab */}
          <TabsContent value="subscription" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Subscription Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4" />
                    Subscription
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Subscription Tier</Label>
                    {editing ? (
                      <Select value={subscriptionTier || 'free'} onValueChange={setSubscriptionTier}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1">
                        <Badge variant="secondary" className="capitalize">
                          {subscriptionTier || user.subscription_tier || 'free'}
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Credits Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4" />
                    Credits Balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Current Balance</Label>
                    {editing ? (
                      <Input
                        type="number"
                        value={credits}
                        onChange={(e) => setCredits(parseInt(e.target.value) || 0)}
                        className="mt-1"
                        min={0}
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-bold">{credits ?? user.credits ?? 0}</span>
                        <span className="text-muted-foreground">credits</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Activity tracking coming soon</p>
                  <p className="text-sm mt-1">
                    This section will show user login history, actions, and usage statistics
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Usage Tab */}
          <TabsContent value="ai-usage" className="space-y-4">
            <AIUsageTab userId={user.user_id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default UserDetailPage;
