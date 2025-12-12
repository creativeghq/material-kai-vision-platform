/**
 * Asset Store - Manages asset library state
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AssetCategory } from '@/types/designer';

interface FilterState {
  category: string | null;
  tags: string[];
  roomType: string | null;
  searchQuery: string;
}

interface AssetStore {
  // State
  categories: AssetCategory[];
  selectedCategory: string | null;
  filters: FilterState;
  searchQuery: string;

  // Actions
  setCategories: (categories: AssetCategory[]) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
}

const defaultFilters: FilterState = {
  category: null,
  tags: [],
  roomType: null,
  searchQuery: '',
};

export const useAssetStore = create<AssetStore>()(
  devtools(
    (set) => ({
      // Initial state
      categories: [],
      selectedCategory: null,
      filters: defaultFilters,
      searchQuery: '',

      // Actions
      setCategories: (categories) => set({ categories }),

      setSelectedCategory: (categoryId) => set({ selectedCategory: categoryId }),

      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),

      setSearchQuery: (query) =>
        set((state) => ({
          searchQuery: query,
          filters: { ...state.filters, searchQuery: query },
        })),

      clearFilters: () => set({ filters: defaultFilters, searchQuery: '' }),
    }),
    { name: 'AssetStore' }
  )
);

