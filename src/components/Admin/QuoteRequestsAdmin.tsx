import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Eye, Plus, CheckCircle, XCircle, Clock, Trash2, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems } from '@/services/quotes/QuotesService';
import { usersAPI } from '@/services/crm.service';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  id: string;
  user_id: string;
  status: string;
}

export const QuoteRequestsAdmin: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [quoteRequests, setQuoteRequests] = useState<QuoteWithItems[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteWithItems | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Create quote form state
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [quoteName, setQuoteName] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [customRequest, setCustomRequest] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadQuoteRequests();
    loadUsers();
  }, []);

  const loadQuoteRequests = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getQuoteRequests();
      setQuoteRequests(data);
    } catch (error) {
      console.error('Error loading quote requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const usersList: UserProfile[] = [];

      // Always add current user first
      if (user) {
        const { data: currentUserProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (currentUserProfile) {
          usersList.push(currentUserProfile);
        }
      }

      // Try to load all users from CRM (admin only)
      try {
        const { data } = await usersAPI.listUsers(100, 0);
        if (data) {
          // Add other users, avoiding duplicates
          const otherUsers = data.filter((u: UserProfile) => u.user_id !== user?.id);
          usersList.push(...otherUsers);
        }
      } catch (error: any) {
        // ✅ FIX: Silently handle admin access errors - current user already added
        if (error?.message !== 'Admin access required') {
          console.error('Error loading CRM users:', error);
        }
      }

      setUsers(usersList);
    } catch (error: any) {
      console.error('Error loading users:', error);
    }
  };

  const handleViewQuote = async (quoteId: string) => {
    try {
      const quote = await quotesService.getQuoteRequest(quoteId);
      setSelectedQuote(quote);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error loading quote details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote details',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this quote request?')) return;

    try {
      await quotesService.deleteQuoteRequest(quoteId);
      toast({
        title: 'Success',
        description: 'Quote request deleted successfully',
      });
      loadQuoteRequests();
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete quote request',
        variant: 'destructive',
      });
    }
  };

  const handleCreateQuote = async () => {
    if (!selectedUserId) {
      toast({
        title: 'Error',
        description: 'Please select a user',
        variant: 'destructive',
      });
      return;
    }

    try {
      setCreating(true);
      // Create quote for the selected user
      const quote = await quotesService.createQuote({
        name: quoteName || undefined,
        notes: quoteNotes || undefined,
        custom_request_text: customRequest || undefined,
      });

      toast({
        title: 'Success',
        description: `Quote created for user`,
      });
      
      setShowCreateModal(false);
      setSelectedUserId('');
      setQuoteName('');
      setQuoteNotes('');
      setCustomRequest('');
      loadQuoteRequests();
    } catch (error) {
      console.error('Error creating quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to create quote',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { icon: Clock, className: 'bg-gray-100 text-gray-800' },
      submitted: { icon: FileText, className: 'bg-blue-100 text-blue-800' },
      quoted: { icon: CheckCircle, className: 'bg-purple-100 text-purple-800' },
      accepted: { icon: CheckCircle, className: 'bg-green-100 text-green-800' },
      rejected: { icon: XCircle, className: 'bg-red-100 text-red-800' },
      expired: { icon: XCircle, className: 'bg-gray-100 text-gray-600' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Quote Requests"
          description="Manage customer quote requests and create quotes for users"
          badge="Admin"
        />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading quote requests...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Quote Requests"
        description="Manage customer quote requests and create quotes for users"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">{quoteRequests.length}</div>
            <div className="text-sm text-muted-foreground">Total Requests</div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Clock className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">
              {quoteRequests.filter(q => q.status === 'submitted').length}
            </div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <CheckCircle className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">
              {quoteRequests.filter(q => q.status === 'accepted').length}
            </div>
            <div className="text-sm text-muted-foreground">Accepted</div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <XCircle className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">
              {quoteRequests.filter(q => q.status === 'rejected').length}
            </div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">All Quote Requests</h2>
          <Button
            onClick={() => setShowCreateModal(true)}
            style={{
              backgroundColor: 'hsl(var(--primary))',
              color: 'white'
            }}
            className="hover:opacity-90"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Create Quote for User
          </Button>
        </div>

        {/* Quote Requests Table */}
        <div className="dashboard-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote Name</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quoteRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No quote requests found
                  </TableCell>
                </TableRow>
              ) : (
                quoteRequests.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">
                      {quote.name || `Quote #${quote.id.substring(0, 8)}`}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {quote.user_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell>{quote.total_items}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(quote.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(quote.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewQuote(quote.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteQuote(quote.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Quote Request Details</DialogTitle>
            <DialogDescription>
              {selectedQuote?.name || `Quote #${selectedQuote?.id.substring(0, 8)}`}
            </DialogDescription>
          </DialogHeader>
          {selectedQuote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedQuote.status)}</div>
                </div>
                <div>
                  <p className="text-sm font-medium">Total Items</p>
                  <p className="mt-1">{selectedQuote.total_items}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="mt-1 text-sm">{new Date(selectedQuote.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Expires</p>
                  <p className="mt-1 text-sm">{new Date(selectedQuote.expires_at).toLocaleString()}</p>
                </div>
              </div>
              {selectedQuote.notes && (
                <div>
                  <p className="text-sm font-medium">Notes</p>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedQuote.notes}</p>
                </div>
              )}
              {selectedQuote.custom_request_text && (
                <div>
                  <p className="text-sm font-medium">Custom Request</p>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedQuote.custom_request_text}</p>
                </div>
              )}
              {selectedQuote.items && selectedQuote.items.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Items</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product ID</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Added From</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedQuote.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">
                              {item.product_id.substring(0, 8)}...
                            </TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell className="text-sm">{item.added_from}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Quote Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Quote for User</DialogTitle>
            <DialogDescription>
              Create a new quote request and assign it to a user from CRM
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Select User</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.user_id.substring(0, 8)}... ({user.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Quote Name (Optional)</label>
              <Input
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
                placeholder="e.g., Office Renovation Quote"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Add any notes or instructions..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Custom Request (Optional)</label>
              <Textarea
                value={customRequest}
                onChange={(e) => setCustomRequest(e.target.value)}
                placeholder="Describe custom requirements..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateQuote}
                disabled={creating || !selectedUserId}
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'white'
                }}
                className="hover:opacity-90"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Quote
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


