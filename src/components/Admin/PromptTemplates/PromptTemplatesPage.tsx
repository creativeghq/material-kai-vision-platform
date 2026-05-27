import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { supabase } from '@/integrations/supabase/client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';

interface PromptTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  stage: string;
  category: string | null;
  prompt_template: string;
  system_prompt: string | null;
  model_preference: string | null;
  temperature: number;
  max_tokens: number;
  is_default: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export const PromptTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');

  // Default workspace ID (you should get this from context/auth)
  const workspaceId = '00000000-0000-0000-0000-000000000000';

  useEffect(() => {
    loadTemplates();
  }, [selectedStage, selectedIndustry]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (selectedStage !== 'all') params.append('stage', selectedStage);
      if (selectedIndustry !== 'all') params.append('industry', selectedIndustry);

      const response = await fetch(
        `https://v1api.materialshub.gr/admin/prompt-templates?${params}`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to load templates: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load prompt templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getIndustryBadge = (industry: string | null) => {
    if (!industry) return <Badge variant="outline">General</Badge>;

    const colors: Record<string, string> = {
      construction: 'bg-orange-100 text-orange-700 border-orange-200',
      interior_design: 'bg-purple-100 text-purple-700 border-purple-200',
      general: 'bg-blue-100 text-blue-700 border-blue-200',
    };

    return (
      <Badge className={colors[industry] || 'bg-gray-100 text-gray-700'}>
        {industry.replace('_', ' ')}
      </Badge>
    );
  };

  const getStageBadge = (stage: string) => {
    const colors: Record<string, string> = {
      metadata_extraction: 'bg-green-100 text-green-700 border-green-200',
      discovery: 'bg-blue-100 text-blue-700 border-blue-200',
      classification: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      chunking: 'bg-pink-100 text-pink-700 border-pink-200',
    };

    return (
      <Badge className={colors[stage] || 'bg-gray-100 text-gray-700'}>
        {stage.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="AI Prompt Templates"
        description="Customize AI prompts for different industries and extraction stages"
        badge="AI Templates"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => loadTemplates()}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => toast({ title: 'Coming Soon', description: 'Template creation UI will be available soon' })}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label className="mb-2 block">Stage</Label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="metadata_extraction">Metadata Extraction</SelectItem>
                    <SelectItem value="discovery">Product Discovery</SelectItem>
                    <SelectItem value="classification">Image Classification</SelectItem>
                    <SelectItem value="chunking">Text Chunking</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-2 block">Industry</Label>
                <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="construction">Construction</SelectItem>
                    <SelectItem value="interior_design">Interior Design</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Prompt Templates</CardTitle>
            <CardDescription>
              {templates.length} template{templates.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No templates found. Create your first template to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{template.name}</div>
                          {template.description && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {template.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getIndustryBadge(template.industry)}</TableCell>
                      <TableCell>{getStageBadge(template.stage)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {template.model_preference || 'auto'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">v{template.version}</TableCell>
                      <TableCell>
                        {template.is_active ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => toast({ title: 'Coming Soon', description: 'Template editing UI will be available soon' })}
                            variant="ghost"
                            size="sm"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
