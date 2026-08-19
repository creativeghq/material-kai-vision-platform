import React, { useState, useEffect } from 'react';
import { Search, User, Check, Plus } from 'lucide-react';
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
import { QuickCreatePartyDialog } from '@/components/business/crm/QuickCreatePartyDialog';

/** Rows offered in the dropdown. The server pages, so this is a display cap, not a search cap. */
const PAGE_SIZE = 50;

interface ContactSearchDropdownProps {
  onSelect: (contactId: string) => void;
  excludeContactIds?: string[];
  placeholder?: string;
  selectedContactId?: string | null;
  /**
   * Offer "create it" when the search finds nothing.
   *
   * Deliberately opt-in and deliberately only reachable from a search that came back
   * empty: this platform's rule is that a CRM party is searched for before it is created,
   * because the same customer entered twice (once in Greek script, once in Latin) is the
   * failure a CRM never recovers from. Reaching create THROUGH the search means the
   * duplicate check has already run and the user has already seen the misses.
   */
  allowCreate?: boolean;
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
  allowCreate = false,
}: ContactSearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);

  // Fetch contacts when search changes
  useEffect(() => {
    const fetchContacts = async () => {
      if (search.length < 2) {
        setContacts([]);
        return;
      }

      setLoading(true);
      try {
        // The term goes to the SERVER. This used to fetch the first 50 contacts and filter the
        // result in the browser, so contact #51 onward was unfindable through this control no
        // matter what was typed — silently, as an empty dropdown reading "no contacts found"
        // (#366 BU-7). crm-api's contacts search matches the folded `search_fold` column and
        // resolves the attached company too, which the client-side substring match never could.
        //
        // Over-fetch by the exclusion count so excluded contacts cannot eat result slots and
        // empty the list; the server has no denylist filter, so the trimming stays here.
        const response = await contactsAPI.listContacts(PAGE_SIZE + excludeContactIds.length, 0, { search });
        const filteredContacts = (response.data as Contact[])
          .filter((contact) => !excludeContactIds.includes(contact.id))
          .slice(0, PAGE_SIZE);
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
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start">
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
              /* The miss IS the duplicate check. By the time this renders the user has
                 searched the folded name index and seen nothing, which is exactly the
                 precondition for creating a party rather than duplicating one. */
              <div className="px-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">No contacts match &ldquo;{search}&rdquo;</p>
                {allowCreate && (
                  <Button size="sm" className="mt-2.5" onClick={() => setCreating(true)}>
                    <Plus /> Create &ldquo;{search.trim()}&rdquo;
                  </Button>
                )}
              </div>
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
            {allowCreate && !loading && search.trim().length >= 2 && contacts.length > 0 && (
              /* Present even when there ARE matches: "Aegean" can return three rows and
                 none of them be the one on the phone. Without this the user's only way
                 out is to abandon the deal and go to the CRM. */
              <CommandGroup>
                <CommandItem value="__create__" onSelect={() => setCreating(true)} className="cursor-pointer text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="font-semibold">Create &ldquo;{search.trim()}&rdquo; as a new contact</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>

      {creating && (
        <QuickCreatePartyDialog
          kind="contact"
          initialName={search.trim()}
          onClose={() => setCreating(false)}
          onCreated={(id, name) => {
            setCreating(false);
            setSelectedContact({ id, name } as Contact);
            onSelect(id);
            setOpen(false);
            setSearch('');
          }}
        />
      )}
    </Popover>
  );
}

