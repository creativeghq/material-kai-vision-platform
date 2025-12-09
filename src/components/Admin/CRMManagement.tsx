import React, { useState, useEffect } from 'react';
import { Users, Building2, Plus, Edit, Trash2, Search, Mail, Shield, CreditCard, Key } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { AdminStatCard } from './AdminStatCard';
import { usersAPI, contactsAPI } from '@/services/crm.service';

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserWithAuth[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  // User modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithAuth | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userRoleId, setUserRoleId] = useState('');
  const [userSubscription, setUserSubscription] = useState('free');
  const [userStatus, setUserStatus] = useState('active');
  const [userCredits, setUserCredits] = useState(0);

  // Contact modal state
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

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

  // Load users from auth.users and join with user_profiles
  const loadUsers = async () => {
    try {
      setLoading(true);

      // Fetch all auth users
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

      if (authError) throw authError;

      // Fetch all user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          user_id,
          role_id,
          subscription_tier,
          status,
          created_at,
          roles (
            id,
            name,
            level
          )
        `);

      if (profilesError) throw profilesError;

      // Fetch user credits
      const { data: creditsData, error: creditsError } = await supabase
        .from('user_credits')
        .select('user_id, balance');

      if (creditsError) console.error('Error loading credits:', creditsError);

      // Merge auth users with profiles and credits
      const mergedUsers: UserWithAuth[] = authData.users.map((authUser) => {
        const profile = profilesData?.find((p) => p.user_id === authUser.id);
        const credits = creditsData?.find((c) => c.user_id === authUser.id);

        return {
          id: profile?.id || authUser.id,
          user_id: authUser.id,
          email: authUser.email || '',
          role_id: profile?.role_id,
          subscription_tier: profile?.subscription_tier || 'free',
          status: profile?.status || 'active',
          credits: credits?.balance || 0,
          created_at: authUser.created_at,
          roles: profile?.roles,
        };
      });

      setUsers(mergedUsers);

      // Calculate stats
      const stats = {
        total: mergedUsers.length,
        active: mergedUsers.filter((u) => u.status === 'active').length,
        inactive: mergedUsers.filter((u) => u.status === 'inactive').length,
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

  // Handle edit contact
  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setShowEditModal(true);
  };

  // Handle save edited contact
  const handleSaveContact = async (updatedContact: Contact) => {
    try {
      await contactsAPI.updateContact(updatedContact.id, updatedContact);
      toast({
        title: 'Success',
        description: 'Contact updated successfully',
      });
      setShowEditModal(false);
      setEditingContact(null);
      await loadContacts();
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({
        title: 'Error',
        description: 'Failed to update contact',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadRoles();
    loadUsers();
    loadContacts();
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
    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
      await contactsAPI.deleteContact(contactId);
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
      loadContacts();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete contact',
        variant: 'destructive',
      });
    }
  };

  // Handle edit user
  const handleEditUser = (user: UserWithAuth) => {
    setEditingUser(user);
    setUserEmail(user.email);
    setUserDisplayName(user.email); // We don't have display_name in the current schema
    setUserRoleId(user.role_id || '');
    setUserSubscription(user.subscription_tier || 'free');
    setUserStatus(user.status || 'active');
    setUserCredits(user.credits || 0);
    setUserPassword(''); // Don't pre-fill password
    setShowUserModal(true);
  };

  // Handle add user
  const handleAddUser = () => {
    setEditingUser(null);
    setUserEmail('');
    setUserPassword('');
    setUserDisplayName('');
    setUserRoleId(roles.find(r => r.name === 'user')?.id || '');
    setUserSubscription('free');
    setUserStatus('active');
    setUserCredits(0);
    setShowUserModal(true);
  };

  // Handle save user
  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Update existing user
        await usersAPI.updateUser(editingUser.user_id, {
          role_id: userRoleId,
          subscription_tier: userSubscription,
          status: userStatus,
        });

        // Update credits if changed
        if (userCredits !== editingUser.credits) {
          await supabase
            .from('user_credits')
            .update({ balance: userCredits })
            .eq('user_id', editingUser.user_id);
        }

        toast({
          title: 'Success',
          description: 'User updated successfully',
        });
      } else {
        // Create new user
        const { data, error } = await supabase.auth.signUp({
          email: userEmail,
          password: userPassword,
          options: {
            data: {
              display_name: userDisplayName,
            },
          },
        });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'User created successfully. They will receive a confirmation email.',
        });
      }

      setShowUserModal(false);
      await loadUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save user',
        variant: 'destructive',
      });
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

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="CRM Management"
        description="Manage users and customer contacts"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Contacts
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
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
              <div className="border rounded-lg overflow-hidden">
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
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              {user.email}
                            </div>
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
                                onClick={() => handleEditUser(user)}
                                title="Edit user"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
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
        <TabsContent value="contacts" className="space-y-4">
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
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </div>

              {/* Contacts Table */}
              <div className="border rounded-lg overflow-hidden">
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
                            {contact.name}
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
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditContact(contact)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleEditContact(contact);
                                  }
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
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
      </Tabs>

      {/* Edit Contact Modal */}
      {showEditModal && editingContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Edit Contact</CardTitle>
              <CardDescription>Update contact information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={editingContact.name}
                    onChange={(e) =>
                      setEditingContact({
                        ...editingContact,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={editingContact.email || ''}
                    onChange={(e) =>
                      setEditingContact({
                        ...editingContact,
                        email: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input
                    value={editingContact.phone || ''}
                    onChange={(e) =>
                      setEditingContact({
                        ...editingContact,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Company</label>
                  <Input
                    value={editingContact.company || ''}
                    onChange={(e) =>
                      setEditingContact({
                        ...editingContact,
                        company: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <Input
                    value={editingContact.notes || ''}
                    onChange={(e) =>
                      setEditingContact({
                        ...editingContact,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingContact(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => handleSaveContact(editingContact)}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Edit/Add Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update user information, role, subscription, and credits'
                : 'Create a new user account. They will receive a confirmation email.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingUser && (
              <>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={userDisplayName}
                    onChange={(e) => setUserDisplayName(e.target.value)}
                    placeholder="John Doe"
                    className="mt-1"
                  />
                </div>
              </>
            )}
            {editingUser && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  <span className="font-medium">{editingUser.email}</span>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="role">Role *</Label>
              <Select value={userRoleId} onValueChange={setUserRoleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select role..." />
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
            </div>
            <div>
              <Label htmlFor="subscription">Subscription Tier *</Label>
              <Select value={userSubscription} onValueChange={setUserSubscription}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status *</Label>
              <Select value={userStatus} onValueChange={setUserStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div>
                <Label htmlFor="credits">Credits</Label>
                <Input
                  id="credits"
                  type="number"
                  value={userCredits}
                  onChange={(e) => setUserCredits(parseInt(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowUserModal(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveUser}>
                {editingUser ? 'Save Changes' : 'Create User'}
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
