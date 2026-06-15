import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Building2, Plus, Trash2, Search, Mail, CreditCard, Key, ExternalLink, Tags } from 'lucide-react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { WorkspaceQuotaBadge } from '@/components/core/WorkspaceQuotaBadge';
import { AdminStatCard } from '@/components/Admin/AdminStatCard';
import { usersAPI, contactsAPI, companiesAPI } from '@/services/crm.service';
import { CategoriesPanel } from './CategoriesPage';

const TAB_VALUES = ['users', 'contacts', 'companies', 'categories'] as const;
type TabValue = typeof TAB_VALUES[number];

interface UserWithAuth {
  id: string;
  user_id: string;
  email: string;
  role_id?: string;
  subscription_tier?: string;
  status?: string;
  credits?: number;
  created_at: string;
  roles?: { id: string; name: string; level: number };
}

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
  level: number;
}

/**
 * CRM Management Component
 * Handles user management and CRM contacts
 */
export const CRMManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const initialTab: TabValue = (() => {
    const t = searchParams.get('tab');
    return (TAB_VALUES as readonly string[]).includes(t || '') ? (t as TabValue) : 'users';
  })();
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const handleTabChange = (val: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(val) ? (val as TabValue) : 'users';
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'users') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserWithAuth[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  // Add user modal state (simplified - only for creating new users)
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);



  // Load roles
  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, level')
        .order('level', { ascending: true});

      if (error) throw error;
      setRoles(data || []);
    } catch (error: any) {
      console.error('Error loading roles:', error);
    }
  };

  // Load users from CRM Users API (Edge Function)
  const loadUsers = async () => {
    try {
      setLoading(true);

      // Use the CRM Users API Edge Function instead of direct admin API
      const response = await usersAPI.listUsers();

      setUsers(response.data || []);

      // Calculate stats
      const stats = {
        total: response.data?.length || 0,
        active: response.data?.filter((u) => u.status === 'active').length || 0,
        inactive: response.data?.filter((u) => u.status === 'inactive').length || 0,
      };
      setUserStats(stats);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast({
        title: 'Error',
        description: `Failed to load users: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load contacts directly from Supabase
  const loadContacts = async () => {
    try {
      setLoading(true);

      // Fetch CRM contacts
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setContacts(data || []);
    } catch (error: any) {
      console.error('Error loading contacts:', error);
      toast({
        title: 'Error',
        description: `Failed to load contacts: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load companies
  const loadCompanies = async () => {
    try {
      setLoading(true);
      const response = await companiesAPI.listCompanies(100, 0);
      setCompanies(response.data || []);
    } catch (error: any) {
      console.error('Error loading companies:', error);
      toast({
        title: 'Error',
        description: `Failed to load companies: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle add contact - navigate to new contact page
  const handleAddContact = () => {
    navigate('/admin/crm/contacts/new');
  };

  useEffect(() => {
    loadRoles();
    loadUsers();
    loadContacts();
    loadCompanies();
  }, []);

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await usersAPI.deleteUser(userId);
      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
      loadUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this contact?');
    if (!confirmed) return;

    try {
      setLoading(true);
      await contactsAPI.deleteContact(contactId);
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
      await loadContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete contact',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Company handlers - navigate to new company page
  const handleAddCompany = () => {
    navigate('/admin/crm/companies/new');
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!confirm('Are you sure you want to delete this company?')) return;

    try {
      await companiesAPI.deleteCompany(companyId);
      toast({
        title: 'Success',
        description: 'Company deleted successfully',
      });
      loadCompanies();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete company',
        variant: 'destructive',
      });
    }
  };

  // Handle add user - open modal for creating new users
  const handleAddUser = () => {
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserDisplayName('');
    setShowAddUserModal(true);
  };

  // Handle create new user
  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({
        title: 'Validation Error',
        description: 'Email and password are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setCreatingUser(true);
      const { error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: {
            display_name: newUserDisplayName,
          },
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User created successfully. They will receive a confirmation email.',
      });

      setShowAddUserModal(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserDisplayName('');
      await loadUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    } finally {
      setCreatingUser(false);
    }
  };

  // Handle reset password
  const handleResetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
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

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_id.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredCompanies = companies.filter(
    (company) =>
      company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.website?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="CRM Management"
        description="Manage users and customer contacts"
        badge="Admin"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* #214 plan-quota usage (hidden when unlimited / operator root) */}
        <div className="flex justify-end">
          <WorkspaceQuotaBadge table="crm_contacts" quotaKey="max_contacts" label="contacts" />
        </div>

        {/* Stats Cards - Compact Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AdminStatCard
            title="Total Users"
            value={userStats.total}
            icon={Users}
            description="Registered users"
            variant="glass"
          />
          <AdminStatCard
            title="Active Users"
            value={userStats.active}
            icon={Users}
            description="Currently active"
            variant="glass"
          />
          <AdminStatCard
            title="Total Contacts"
            value={contacts.length}
            icon={Building2}
            description="CRM contacts"
            variant="glass"
          />
          <AdminStatCard
            title="Total Companies"
            value={companies.length}
            icon={Building2}
            description="CRM companies"
            variant="glass"
          />
        </div>

      {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="contacts">
              <Building2 className="h-4 w-4 mr-2" />
              Contacts
            </TabsTrigger>
            <TabsTrigger value="companies">
              <Building2 className="h-4 w-4 mr-2" />
              Companies
            </TabsTrigger>
            <TabsTrigger value="categories">
              <Tags className="h-4 w-4 mr-2" />
              Categories
            </TabsTrigger>
          </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage platform users, roles, and subscriptions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button onClick={handleAddUser}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>

              {/* Users Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-4">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-4">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/admin/crm/users/${user.user_id}`)}
                              className="text-primary hover:underline flex items-center gap-2"
                            >
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              {user.email}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {user.roles?.name || 'No role'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {user.subscription_tier}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-muted-foreground" />
                              {user.credits || 0}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                user.status === 'active'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResetPassword(user.email)}
                                title="Reset password"
                              >
                                <Key className="h-4 w-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(user.user_id)}
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>CRM Contacts</CardTitle>
              <CardDescription>
                Manage non-user contacts and relationships
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button onClick={handleAddContact}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </div>

              {/* Contacts Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredContacts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4">
                          No contacts found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredContacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/crm/contacts/${contact.id}`)}
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {contact.name}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell>
                            {contact.email ? (
                              <a
                                href={`mailto:${contact.email}`}
                                className="text-blue-600 hover:underline"
                              >
                                {contact.email}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.phone ? (
                              <a
                                href={`tel:${contact.phone}`}
                                className="text-blue-600 hover:underline"
                              >
                                {contact.phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{contact.company || '-'}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(contact.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteContact(contact.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleDeleteContact(contact.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Companies Tab */}
        <TabsContent value="companies" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>CRM Companies</CardTitle>
              <CardDescription>
                Manage company accounts and business relationships
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search companies..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button onClick={handleAddCompany}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Company
                </Button>
              </div>

              {/* Companies Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-4">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredCompanies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-4">
                          No companies found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCompanies.map((company) => (
                        <TableRow key={company.id}>
                          <TableCell className="font-medium">
                            <button
                              onClick={() => navigate(`/crm/companies/${company.id}`)}
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {company.name}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell>
                            {company.email ? (
                              <a
                                href={`mailto:${company.email}`}
                                className="text-blue-600 hover:underline"
                              >
                                {company.email}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {company.phone ? (
                              <a
                                href={`tel:${company.phone}`}
                                className="text-blue-600 hover:underline"
                              >
                                {company.phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {company.website ? (
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {company.website}
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{company.industry || '-'}</TableCell>
                          <TableCell className="text-sm">
                            {new Date(company.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCompany(company.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleDeleteCompany(company.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4 mt-6">
          <CategoriesPanel />
        </TabsContent>
        </Tabs>

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account. They will receive a confirmation email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-email">Email *</Label>
              <Input
                id="new-email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="user@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="new-password">Password *</Label>
              <Input
                id="new-password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="new-displayName">Display Name</Label>
              <Input
                id="new-displayName"
                value={newUserDisplayName}
                onChange={(e) => setNewUserDisplayName(e.target.value)}
                placeholder="John Doe"
                className="mt-1"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              After creating the user, you can edit their role, subscription, and other details from their profile page.
            </p>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddUserModal(false)}
                disabled={creatingUser}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateUser} disabled={creatingUser}>
                {creatingUser ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default CRMManagement;
