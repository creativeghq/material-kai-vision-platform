import React, { useState, useEffect } from 'react';
import { Search, User, Check } from 'lucide-react';
import { usersAPI } from '@/services/crm.service';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/core/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/core/ui/popover';
import { Badge } from '@/components/core/ui/badge';

interface UserSearchDropdownProps {
  onSelect: (userId: string) => void;
  excludeUserIds?: string[];
  placeholder?: string;
  selectedUserId?: string | null;
}

interface User {
  id: string;
  email: string;
  user_profiles?: {
    full_name?: string;
    subscription_tier?: string;
  };
}

export function UserSearchDropdown({
  onSelect,
  excludeUserIds = [],
  placeholder = 'Search users by email or name...',
  selectedUserId,
}: UserSearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Fetch users when search changes
  useEffect(() => {
    const fetchUsers = async () => {
      if (search.length < 2) {
        setUsers([]);
        return;
      }

      setLoading(true);
      try {
        const response = await usersAPI.listUsers(20, 0, search);
        const filteredUsers = response.data.filter(
          (user: User) => !excludeUserIds.includes(user.id),
        );
        setUsers(filteredUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchUsers, 300);
    return () => clearTimeout(debounce);
  }, [search, excludeUserIds]);

  // Load selected user if selectedUserId is provided
  useEffect(() => {
    const loadSelectedUser = async () => {
      if (selectedUserId) {
        try {
          const response = await usersAPI.getUser(selectedUserId);
          setSelectedUser(response.data);
        } catch (error) {
          console.error('Error loading selected user:', error);
        }
      } else {
        setSelectedUser(null);
      }
    };

    loadSelectedUser();
  }, [selectedUserId]);

  const handleSelect = (user: User) => {
    setSelectedUser(user);
    onSelect(user.id);
    setOpen(false);
    setSearch('');
  };

  const getTierBadgeColor = (tier?: string) => {
    switch (tier) {
      case 'pro':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'enterprise':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="truncate">{selectedUser.email}</span>
              {selectedUser.user_profiles?.subscription_tier && (
                <Badge
                  variant="outline"
                  className={getTierBadgeColor(selectedUser.user_profiles.subscription_tier)}
                >
                  {selectedUser.user_profiles.subscription_tier}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {!loading && search.length < 2 && (
              <CommandEmpty>Type at least 2 characters to search</CommandEmpty>
            )}
            {!loading && search.length >= 2 && users.length === 0 && (
              <CommandEmpty>No users found</CommandEmpty>
            )}
            {!loading && users.length > 0 && (
              <CommandGroup>
                {users.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={() => handleSelect(user)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{user.email}</span>
                        </div>
                        {user.user_profiles?.full_name && (
                          <span className="text-sm text-muted-foreground ml-6">
                            {user.user_profiles.full_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {user.user_profiles?.subscription_tier && (
                          <Badge
                            variant="outline"
                            className={getTierBadgeColor(user.user_profiles.subscription_tier)}
                          >
                            {user.user_profiles.subscription_tier}
                          </Badge>
                        )}
                        {selectedUserId === user.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

