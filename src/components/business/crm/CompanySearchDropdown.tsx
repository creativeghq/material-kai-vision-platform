import React, { useState, useEffect } from 'react';
import { Search, Building2, Check, Plus } from 'lucide-react';
import { companiesAPI } from '@/services/crm.service';
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
const PAGE_SIZE = 20;

interface CompanySearchDropdownProps {
  onSelect: (companyId: string) => void;
  excludeCompanyIds?: string[];
  placeholder?: string;
  selectedCompanyId?: string | null;
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

interface Company {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  email?: string;
}

export function CompanySearchDropdown({
  onSelect,
  excludeCompanyIds = [],
  placeholder = 'Search companies by name...',
  selectedCompanyId,
  allowCreate = false,
}: CompanySearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);

  // Fetch companies when search changes
  useEffect(() => {
    const fetchCompanies = async () => {
      if (search.length < 2) {
        setCompanies([]);
        return;
      }

      setLoading(true);
      try {
        // Over-fetch by the exclusion count. The exclusions are applied HERE (the server has no
        // denylist filter), so asking for exactly 20 meant excluded companies consumed result
        // slots and could empty the dropdown outright (#366 BU-14).
        const response = await companiesAPI.listCompanies(PAGE_SIZE + excludeCompanyIds.length, 0, search);
        const filteredCompanies = (response.data as Company[])
          .filter((company) => !excludeCompanyIds.includes(company.id))
          .slice(0, PAGE_SIZE);
        setCompanies(filteredCompanies);
      } catch (error) {
        console.error('Error fetching companies:', error);
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchCompanies, 300);
    return () => clearTimeout(debounce);
  }, [search, excludeCompanyIds]);

  // Load selected company if selectedCompanyId is provided
  useEffect(() => {
    const loadSelectedCompany = async () => {
      if (selectedCompanyId) {
        try {
          const response = await companiesAPI.getCompany(selectedCompanyId);
          setSelectedCompany(response.data);
        } catch (error) {
          console.error('Error loading selected company:', error);
        }
      } else {
        setSelectedCompany(null);
      }
    };

    loadSelectedCompany();
  }, [selectedCompanyId]);

  const handleSelect = (company: Company) => {
    setSelectedCompany(company);
    onSelect(company.id);
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
          {selectedCompany ? (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="truncate">{selectedCompany.name}</span>
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
            {!loading && search.length >= 2 && companies.length === 0 && (
              /* The miss IS the duplicate check. By the time this renders the user has
                 searched the folded name index and seen nothing, which is exactly the
                 precondition for creating a party rather than duplicating one. */
              <div className="px-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">No companies match &ldquo;{search}&rdquo;</p>
                {allowCreate && (
                  <Button size="sm" className="mt-2.5" onClick={() => setCreating(true)}>
                    <Plus /> Create &ldquo;{search.trim()}&rdquo;
                  </Button>
                )}
              </div>
            )}
            {!loading && companies.length > 0 && (
              <CommandGroup>
                {companies.map((company) => (
                  <CommandItem
                    key={company.id}
                    value={company.id}
                    onSelect={() => handleSelect(company)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span className="font-medium">{company.name}</span>
                        </div>
                        {(company.industry || company.website) && (
                          <span className="text-sm text-muted-foreground ml-6">
                            {company.industry && company.industry}
                            {company.industry && company.website && ' • '}
                            {company.website && company.website}
                          </span>
                        )}
                      </div>
                      {selectedCompanyId === company.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {allowCreate && !loading && search.trim().length >= 2 && companies.length > 0 && (
              /* Present even when there ARE matches: "Aegean" can return three rows and
                 none of them be the one on the phone. Without this the user's only way
                 out is to abandon the deal and go to the CRM. */
              <CommandGroup>
                <CommandItem value="__create__" onSelect={() => setCreating(true)} className="cursor-pointer text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="font-semibold">Create &ldquo;{search.trim()}&rdquo; as a new company</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>

      {creating && (
        <QuickCreatePartyDialog
          kind="company"
          initialName={search.trim()}
          onClose={() => setCreating(false)}
          onCreated={(id, name) => {
            setCreating(false);
            setSelectedCompany({ id, name } as Company);
            onSelect(id);
            setOpen(false);
            setSearch('');
          }}
        />
      )}
    </Popover>
  );
}

