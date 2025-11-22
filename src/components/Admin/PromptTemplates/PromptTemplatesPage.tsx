import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit,
  RefreshCw,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load templates');

      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load prompt templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getIndustryBadge = (industry: string | null) => {
    if (!industry) return <Badge variant="outline">General</Badge>;
    
    const colors: Record<string, string> = {
      construction: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      interior_design: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      general: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    };

    return (
      <Badge className={colors[industry] || 'bg-gray-500/20 text-gray-300'}>
        {industry.replace('_', ' ')}
      </Badge>
    );
  };

  const getStageBadge = (stage: string) => {
    const colors: Record<string, string> = {
      metadata_extraction: 'bg-green-500/20 text-green-300 border-green-500/30',
      discovery: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      classification: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      chunking: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    };

    return (
      <Badge className={colors[stage] || 'bg-gray-500/20 text-gray-300'}>
        {stage.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/admin')}
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-purple-400" />
              AI Prompt Templates
            </h1>
            <p className="text-white/60 mt-1">
              Customize AI prompts for different industries and extraction stages
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => loadTemplates()}
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => toast({ title: 'Coming Soon', description: 'Template creation UI will be available soon' })}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 bg-white/5 border-white/10 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-white/70 mb-2 block">Stage</Label>
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
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
              <Label className="text-white/70 mb-2 block">Industry</Label>
              <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
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
      <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Prompt Templates</CardTitle>
          <CardDescription className="text-white/60">
            {templates.length} template{templates.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-white/60">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-white/60">
              No templates found. Create your first template to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-white/70">Name</TableHead>
                  <TableHead className="text-white/70">Industry</TableHead>
                  <TableHead className="text-white/70">Stage</TableHead>
                  <TableHead className="text-white/70">Model</TableHead>
                  <TableHead className="text-white/70">Version</TableHead>
                  <TableHead className="text-white/70">Status</TableHead>
                  <TableHead className="text-white/70 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow
                    key={template.id}
                    className="border-white/10 hover:bg-white/5"
                  >
                    <TableCell className="text-white">
                      <div>
                        <div className="font-medium">{template.name}</div>
                        {template.description && (
                          <div className="text-sm text-white/60 mt-1">
                            {template.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getIndustryBadge(template.industry)}</TableCell>
                    <TableCell>{getStageBadge(template.stage)}</TableCell>
                    <TableCell className="text-white/70">
                      {template.model_preference || 'auto'}
                    </TableCell>
                    <TableCell className="text-white/70">v{template.version}</TableCell>
                    <TableCell>
                      {template.is_active ? (
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-white/40">
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
                          className="text-white/70 hover:text-white hover:bg-white/10"
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
  );
};
