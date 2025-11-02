import { useEffect } from 'react';

import { useToast } from '@/hooks/use-toast';

import { NewScraperPage } from './NewScraperPage';

export const MaterialScraperPage = () => {
  const { toast } = useToast();

  useEffect(() => {
    toast({
      title: 'Scraper Updated',
      description:
        'The scraper has been upgraded with better controls and monitoring.',
    });
  }, [toast]);

  return <NewScraperPage />;
};
