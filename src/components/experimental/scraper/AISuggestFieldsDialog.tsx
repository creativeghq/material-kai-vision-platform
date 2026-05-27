import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/core/ui/scroll-area';

interface FieldMapping {
  name: string;
  label: string;
  type: 'text' | 'number' | 'array' | 'object' | 'boolean';
  description: string;
  required: boolean;
}

interface AISuggestFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onApplyFields: (fields: FieldMapping[]) => void;
}

export const AISuggestFieldsDialog: React.FC<AISuggestFieldsDialogProps> = ({
  open,
  onOpenChange,
  url,
  onApplyFields,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suggestedFields, setSuggestedFields] = useState<FieldMapping[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  const handleSuggest = async () => {
    try {
      setLoading(true);
      setSuggestedFields([]);
      setSelectedFields(new Set());

      const response = await fetch(
        'https://v1api.materialshub.gr/scraping/suggest-fields',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ url }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to suggest fields');
      }

      const data = await response.json();
      setSuggestedFields(data.fields || []);

      // Select all fields by default
      setSelectedFields(new Set(data.fields.map((f: FieldMapping) => f.name)));

      toast({
        title: 'AI Analysis Complete',
        description: `Suggested ${data.fields.length} fields based on page content`,
      });
    } catch (error: any) {
      console.error('Error suggesting fields:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to analyze page',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleField = (fieldName: string) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
    } else {
      newSelected.add(fieldName);
    }
    setSelectedFields(newSelected);
  };

  const handleApply = () => {
    const fieldsToApply = suggestedFields.filter((f) => selectedFields.has(f.name));
    onApplyFields(fieldsToApply);
    onOpenChange(false);

    toast({
      title: 'Fields Applied',
      description: `Added ${fieldsToApply.length} AI-suggested fields`,
    });
  };

  React.useEffect(() => {
    if (open && url) {
      handleSuggest();
    }
  }, [open, url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI Field Suggestions
          </DialogTitle>
          <DialogDescription>
            AI analyzed the page and suggested these fields for extraction
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center">
            <Sparkles className="h-8 w-8 mx-auto mb-4 text-purple-600 animate-pulse" />
            <p className="text-muted-foreground">Analyzing page content...</p>
          </div>
        ) : suggestedFields.length > 0 ? (
          <>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {suggestedFields.map((field) => (
                  <Card
                    key={field.name}
                    className={`cursor-pointer transition-all ${
                      selectedFields.has(field.name)
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground/30'
                    }`}
                    onClick={() => handleToggleField(field.name)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedFields.has(field.name)}
                          onCheckedChange={() => handleToggleField(field.name)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{field.label}</h4>
                            <Badge variant="secondary" className="text-xs">
                              {field.type}
                            </Badge>
                            {field.required && (
                              <Badge variant="destructive" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{field.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Field name: <code className="bg-muted px-1 rounded">{field.name}</code>
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleApply} disabled={selectedFields.size === 0}>
                <Check className="h-4 w-4 mr-2" />
                Apply {selectedFields.size} Field{selectedFields.size !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

