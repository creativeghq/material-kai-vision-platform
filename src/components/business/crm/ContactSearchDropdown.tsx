import React, { useState, useEffect } from 'react';
import { Search, User, Check } from 'lucide-react';
import { contactsAPI } from '@/services/crm.service';
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

interface ContactSearchDropdownProps {
  onSelect: (contactId: string) => void;
  excludeContactIds?: string[];
  placeholder?: string;
  selectedContactId?: string | null;
}

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
}

export function ContactSearchDropdown({
  onSelect,
  excludeContactIds = [],
  placeholder = 'Search contacts by name...',
  selectedContactId,
}: ContactSearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Fetch contacts when search changes
  useEffect(() => {
    const fetchContacts = async () => {
      if (search.length < 2) {
        setContacts([]);
        return;
      }

      setLoading(true);
      try {
        const response = await contactsAPI.listContacts(50, 0);
        const term = search.toLowerCase();
        const filteredContacts = response.data.filter((contact: Contact) => {
          if (excludeContactIds.includes(contact.id)) return false;
          const haystack = [contact.name, contact.email, contact.company]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(term);
        });
        setContacts(filteredContacts);
      } catch (error) {
        console.error('Error fetching contacts:', error);
        setContacts([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchContacts, 300);
    return () => clearTimeout(debounce);
  }, [search, excludeContactIds]);

  // Load selected contact if selectedContactId is provided
  useEffect(() => {
    const loadSelectedContact = async () => {
      if (selectedContactId) {
        try {
          const response = await contactsAPI.getContact(selectedContactId);
          setSelectedContact(response.data);
        } catch (error) {
          console.error('Error loading selected contact:', error);
        }
      } else {
        setSelectedContact(null);
      }
    };

    loadSelectedContact();
  }, [selectedContactId]);

  const handleSelect = (contact: Contact) => {
    setSelectedContact(contact);
    onSelect(contact.id);
    setOpen(false);
    setSearch('');
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
          {selectedContact ? (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="truncate">{selectedContact.name}</span>
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
            {!loading && search.length >= 2 && contacts.length === 0 && (
              <CommandEmpty>No contacts found</CommandEmpty>
            )}
            {!loading && contacts.length > 0 && (
              <CommandGroup>
                {contacts.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={contact.id}
                    onSelect={() => handleSelect(contact)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{contact.name}</span>
                        </div>
                        {(contact.email || contact.company || contact.position) && (
                          <span className="text-sm text-muted-foreground ml-6">
                            {contact.position && contact.position}
                            {contact.position && contact.company && ' at '}
                            {contact.company && contact.company}
                            {(contact.position || contact.company) && contact.email && ' • '}
                            {contact.email && contact.email}
                          </span>
                        )}
                      </div>
                      {selectedContactId === contact.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
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

