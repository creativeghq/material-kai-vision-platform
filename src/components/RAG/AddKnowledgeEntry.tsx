import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  FileText, 
  ExternalLink, 
  Database, 
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EnhancedRAGService } from '@/services/enhancedRAGService';

interface AddKnowledgeEntryProps {
  onEntryAdded?: (entry: any) => void;
}

export const AddKnowledgeEntry: React.FC<AddKnowledgeEntryProps> = ({ onEntryAdded }) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    contentType: 'article',
    sourceUrl: '',
    pdfUrl: '', // New field for PDF links
    materialCategories: [] as string[],
    semanticTags: [] as string[],
    language: 'en',
    readingLevel: 3,
    technicalComplexity: 3
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addTag = (field: 'materialCategories' | 'semanticTags', value: string) => {
    if (value.trim() && !formData[field].includes(value.trim())) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], value.trim()]
      }));
    }
  };

  const removeTag = (field: 'materialCategories' | 'semanticTags', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({
        title: "Required Fields Missing",
        description: "Please provide both title and content",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const entry = await EnhancedRAGService.addKnowledgeEntry({
        title: formData.title,
        content: formData.content,
        contentType: formData.contentType,
        sourceUrl: formData.sourceUrl || undefined,
        pdfUrl: formData.pdfUrl || undefined, // Include PDF URL
        materialCategories: formData.materialCategories,
        semanticTags: formData.semanticTags,
        language: formData.language,
        readingLevel: formData.readingLevel,
        technicalComplexity: formData.technicalComplexity
      });

      toast({
        title: "Knowledge Entry Added",
        description: "Successfully added to the knowledge base with embeddings",
      });

      // Reset form
      setFormData({
        title: '',
        content: '',
        contentType: 'article',
        sourceUrl: '',
        pdfUrl: '',
        materialCategories: [],
        semanticTags: [],
        language: 'en',
        readingLevel: 3,
        technicalComplexity: 3
      });

      onEntryAdded?.(entry);
    } catch (error) {
      console.error('Error adding knowledge entry:', error);
      toast({
        title: "Failed to Add Entry",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Add Knowledge Entry
        </CardTitle>
        <CardDescription>
          Add new content to the knowledge base with optional PDF links for additional details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter knowledge entry title..."
              required
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => handleInputChange('content', e.target.value)}
              placeholder="Enter the main content of this knowledge entry..."
              rows={6}
              required
            />
          </div>

          {/* Content Type */}
          <div className="space-y-2">
            <Label htmlFor="contentType">Content Type</Label>
            <Select value={formData.contentType} onValueChange={(value) => handleInputChange('contentType', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="article">📄 Article</SelectItem>
                <SelectItem value="research_paper">🔬 Research Paper</SelectItem>
                <SelectItem value="technical_spec">⚙️ Technical Specification</SelectItem>
                <SelectItem value="material_guide">🧱 Material Guide</SelectItem>
                <SelectItem value="case_study">📊 Case Study</SelectItem>
                <SelectItem value="tutorial">🎓 Tutorial</SelectItem>
                <SelectItem value="reference">📚 Reference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* URLs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pdfUrl" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                PDF URL (Supabase)
              </Label>
              <Input
                id="pdfUrl"
                value={formData.pdfUrl}
                onChange={(e) => handleInputChange('pdfUrl', e.target.value)}
                placeholder="https://your-supabase-url/storage/v1/object/public/..."
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Link to PDF stored on Supabase for additional details
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sourceUrl" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Source URL
              </Label>
              <Input
                id="sourceUrl"
                value={formData.sourceUrl}
                onChange={(e) => handleInputChange('sourceUrl', e.target.value)}
                placeholder="https://example.com/source"
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Original source or reference URL
              </p>
            </div>
          </div>

          {/* Material Categories */}
          <div className="space-y-2">
            <Label>Material Categories</Label>
            <Input
              placeholder="Add material category (press Enter)"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const value = (e.target as HTMLInputElement).value;
                  addTag('materialCategories', value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {formData.materialCategories.map((category, i) => (
                <Badge 
                  key={i} 
                  variant="secondary" 
                  className="cursor-pointer"
                  onClick={() => removeTag('materialCategories', i)}
                >
                  {category} ×
                </Badge>
              ))}
            </div>
          </div>

          {/* Semantic Tags */}
          <div className="space-y-2">
            <Label>Semantic Tags</Label>
            <Input
              placeholder="Add semantic tag (press Enter)"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const value = (e.target as HTMLInputElement).value;
                  addTag('semanticTags', value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {formData.semanticTags.map((tag, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className="cursor-pointer"
                  onClick={() => removeTag('semanticTags', i)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>

          {/* Complexity Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={formData.language} onValueChange={(value) => handleInputChange('language', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="readingLevel">Reading Level (1-5)</Label>
              <Select 
                value={formData.readingLevel.toString()} 
                onValueChange={(value) => handleInputChange('readingLevel', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Basic</SelectItem>
                  <SelectItem value="2">2 - Elementary</SelectItem>
                  <SelectItem value="3">3 - Intermediate</SelectItem>
                  <SelectItem value="4">4 - Advanced</SelectItem>
                  <SelectItem value="5">5 - Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="technicalComplexity">Technical Complexity (1-5)</Label>
              <Select 
                value={formData.technicalComplexity.toString()} 
                onValueChange={(value) => handleInputChange('technicalComplexity', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Simple</SelectItem>
                  <SelectItem value="2">2 - Basic</SelectItem>
                  <SelectItem value="3">3 - Moderate</SelectItem>
                  <SelectItem value="4">4 - Complex</SelectItem>
                  <SelectItem value="5">5 - Highly Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PDF URL Info Alert */}
          {formData.pdfUrl && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                PDF link will be displayed in search results, allowing users to access the original document for additional details.
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding to Knowledge Base...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Knowledge Entry
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};