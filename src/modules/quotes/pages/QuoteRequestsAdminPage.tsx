import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Loader2, Eye, Plus, CheckCircle, XCircle, Clock, Trash2, UserPlus, ListChecks, Gift, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/core/ui/button';
import { statusTone } from '@/utils/statusTone';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/core/ui/sheet';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildQuoteRequestFilters } from '../components/quoteFilters';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems, StatusTag } from '../services/QuotesService';
import { usersAPI } from '@/services/crm.service';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { TimelineStepsManagement } from './TimelineStepsManagementPage';
import { UpsellsManagement } from './UpsellsManagementPage';
import { QuoteSettingsPage } from './QuoteSettingsPage';

interface UserProfile {
  id: string;
  user_id: string;
  status: string;
  full_name?: string | null;
  email?: string | null;
}

export const QuoteRequestsAdmin: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [quoteRequests, setQuoteRequests] = useState<QuoteWithItems[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [statusTags, setStatusTags] = useState<StatusTag[]>([]);
  const [page, setPage] = useState(1);

  // Slide-out panels state
  const [showTimelinePanel, setShowTimelinePanel] = useState(false);
  const [showUpsellsPanel, setShowUpsellsPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Create quote form state
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [quoteName, setQuoteName] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [customRequest, setCustomRequest] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadQuoteRequests();
    loadUsers();
    loadStatusTags();
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

  const loadStatusTags = async () => {
    try {
      const tags = await quotesService.getStatusTags();
      setStatusTags(tags);
    } catch (error) {
      console.error('Error loading status tags:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const usersList: UserProfile[] = [];

      // Always add current user first
      if (user) {
        const { data: currentUserProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, user_id, role_id, subscription_tier, status, created_at, full_name, email')
          .eq('user_id', user.id)
          .maybeSingle(); // Use maybeSingle to avoid 406 error when no profile exists

        if (currentUserProfile && !profileError) {
          usersList.push({
            ...currentUserProfile,
            email: currentUserProfile.email || user.email || '',
          });
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
      } catch {
        // Silently handle CRM access errors - current user already added
        // This is expected for non-admin users
      }

      setUsers(usersList);
    } catch {
      // Silently handle any errors - users list will just be empty
    }
  };

  const handleViewQuote = (quoteId: string) => {
    navigate(`/admin/quotes/${quoteId}`);
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
        description: `Quote "${quote.name || quote.id.slice(0, 8)}" created`,
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

  // Requester ids only resolve to a name once the CRM user list has loaded; fall back to a
  // truncated id so the option is still selectable for non-admins who can't list users.
  const requesterName = React.useCallback((userId: string) => {
    const u = users.find((x) => x.user_id === userId);
    return u?.full_name?.trim() || u?.email || `${userId.substring(0, 8)}…`;
  }, [users]);

  const filterGroups = useMemo(
    () => buildQuoteRequestFilters(quoteRequests, { statusTags, requesterName }),
    [quoteRequests, statusTags, requesterName],
  );
  const { values: filterValues, setValues: setFilterValues, filtered: filteredQuoteRequests, previewCount } =
    useFilters<QuoteWithItems>(quoteRequests, filterGroups);

  // Deleting a request (or a reload returning fewer rows) can leave us past the last page.
  useEffect(() => {
    setPage(prev => clampPage(prev, filteredQuoteRequests.length));
  }, [filteredQuoteRequests.length]);
  useEffect(() => { setPage(1); }, [filterValues]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { icon: Clock, className: 'bg-gray-100 text-gray-800 hover:bg-gray-100' },
      submitted: { icon: FileText, className: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
      quoted: { icon: CheckCircle, className: 'bg-purple-100 text-purple-800 hover:bg-purple-100' },
      accepted: { icon: CheckCircle, className: 'bg-green-100 text-green-800 hover:bg-green-100' },
      rejected: { icon: XCircle, className: 'bg-red-100 text-red-800 hover:bg-red-100' },
      expired: { icon: XCircle, className: 'bg-gray-100 text-gray-600 hover:bg-gray-100' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center text-xs capitalize ${statusTone(status)}`}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </span>
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

      <div className="p-3 sm:p-6 space-y-6">
        {/* Compact Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-2xl font-bold">{quoteRequests.length}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="text-2xl font-bold">{quoteRequests.filter(q => q.status === 'submitted').length}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Quoted</p>
            </div>
            <div className="text-2xl font-bold">{quoteRequests.filter(q => q.status === 'quoted').length}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Accepted</p>
            </div>
            <div className="text-2xl font-bold">{quoteRequests.filter(q => q.status === 'accepted').length}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
            <div className="text-2xl font-bold">{quoteRequests.filter(q => q.status === 'rejected').length}</div>
          </div>
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Draft</p>
            </div>
            <div className="text-2xl font-bold">{quoteRequests.filter(q => q.status === 'draft').length}</div>
          </div>
        </div>

        {/* Actions */}
        <SectionHeader
          title="All Quote Requests"
          actions={
            <>
              <FilterBar
                groups={filterGroups}
                values={filterValues}
                onChange={setFilterValues}
                previewCount={previewCount}
                title="Filter quote requests"
              />
              <Button
                variant="outline"
                onClick={() => setShowTimelinePanel(true)}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                Global timeline elements
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowUpsellsPanel(true)}
              >
                <Gift className="h-4 w-4 mr-2" />
                Global upsells elements
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettingsPanel(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Quote settings
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'white',
                }}
                className="hover:opacity-90"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Create quote for user
              </Button>
            </>
          }
        />

        {/* Quote Requests Table */}
        <div className="dashboard-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Status Tag</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuoteRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No quote requests found
                  </TableCell>
                </TableRow>
              ) : (
                paginate(filteredQuoteRequests, page).map((quote) => {
                    const statusTag = statusTags.find(tag => tag.id === quote.status_tag_id);
                    return (
                  <TableRow
                    key={quote.id}
                    className="cursor-pointer hover:bg-muted/50"
                    // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                    // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                    // row is invalid ARIA and yields a focus stop with no name.
                    onClick={() => handleViewQuote(quote.id)}
                  >
                    <TableCell className="font-medium">
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleViewQuote(quote.id); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {quote.name || 'Untitled Quote'}
                      </button>
                    </TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell>
                      {statusTag ? (
                        <span className="text-xs" style={{ color: statusTag.color }}>
                          {statusTag.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">No tag</span>
                      )}
                    </TableCell>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewQuote(quote.id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuote(quote.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            total={filteredQuoteRequests.length}
            onPageChange={setPage}
            label="requests"
          />
        </div>
      </div>

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
              <label htmlFor="quoterequestsadminpage-select-user" className="text-sm font-medium">Select User</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="quoterequestsadminpage-select-user" className="mt-1">
                  <SelectValue placeholder="Choose a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => {
                    const displayName = u.full_name?.trim() || u.email || `${u.user_id.substring(0, 8)}…`;
                    const displayEmail = u.email && u.full_name?.trim() ? u.email : null;
                    return (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {displayName}
                        {displayEmail ? ` (${displayEmail})` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="quoterequestsadminpage-quote-name-optional" className="text-sm font-medium">Quote Name (Optional)</label>
              <Input id="quoterequestsadminpage-quote-name-optional"
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
                placeholder="e.g., Office Renovation Quote"
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="quoterequestsadminpage-notes-optional" className="text-sm font-medium">Notes (Optional)</label>
              <Textarea id="quoterequestsadminpage-notes-optional"
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Add any notes or instructions..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <label htmlFor="quoterequestsadminpage-custom-request-optional" className="text-sm font-medium">Custom Request (Optional)</label>
              <Textarea id="quoterequestsadminpage-custom-request-optional"
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
                  color: 'white',
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

      {/* Global Timeline Elements Slide-out Panel */}
      <Sheet open={showTimelinePanel} onOpenChange={setShowTimelinePanel}>
        <SheetContent side="right" className="w-[50vw] max-w-[50vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Global Timeline Elements
            </SheetTitle>
            <SheetDescription>
              Manage the global timeline steps that can be assigned to quotes
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <TimelineStepsManagement embedded />
          </div>
        </SheetContent>
      </Sheet>

      {/* Global Upsells Elements Slide-out Panel */}
      <Sheet open={showUpsellsPanel} onOpenChange={setShowUpsellsPanel}>
        <SheetContent side="right" className="w-[50vw] max-w-[50vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Global Upsells Elements
            </SheetTitle>
            <SheetDescription>
              Manage the global upsells that can be added to quotes
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <UpsellsManagement embedded />
          </div>
        </SheetContent>
      </Sheet>

      {/* Quote Settings Slide-out Panel */}
      <Sheet open={showSettingsPanel} onOpenChange={setShowSettingsPanel}>
        <SheetContent side="right" className="w-[60vw] max-w-[60vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quote Settings
            </SheetTitle>
            <SheetDescription>
              Configure quote expiration days and PDF template (cover, intro, content, back-cover + company details).
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <QuoteSettingsPage embedded />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};


