/**
 * Add Product to Monitoring
 * Modal to add a product to price monitoring
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AddProductToMonitoringProps {
  onProductAdded: () => void;
}

export const AddProductToMonitoring: React.FC<AddProductToMonitoringProps> = ({
  onProductAdded,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const handleAddProduct = async () => {
    // TODO: Implement product selection and monitoring setup
    toast({
      title: 'Coming Soon',
      description: 'Product selection interface will be available soon',
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product to Monitoring</DialogTitle>
          <DialogDescription>
            Select a product to start monitoring its price across competitor websites
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Product selection interface coming soon...
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddProductToMonitoring;

