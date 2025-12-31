import React, { useState, useEffect } from 'react';
import { Search, Building2, Check } from 'lucide-react';
import { companiesAPI } from '@/services/crm.service';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface CompanySearchDropdownProps {
  onSelect: (companyId: string) => void;
  excludeCompanyIds?: string[];
  placeholder?: string;
  selectedCompanyId?: string | null;
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
}: CompanySearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // Fetch companies when search changes
  useEffect(() => {
    const fetchCompanies = async () => {
      if (search.length < 2) {
        setCompanies([]);
        return;
      }

      setLoading(true);
      try {
        const response = await companiesAPI.listCompanies(20, 0, search);
        const filteredCompanies = response.data.filter(
          (company: Company) => !excludeCompanyIds.includes(company.id)
        );
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
            {!loading && search.length >= 2 && companies.length === 0 && (
              <CommandEmpty>No companies found</CommandEmpty>
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

