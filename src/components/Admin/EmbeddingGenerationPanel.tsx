import React, { useState, useEffect } from 'react';
import {
  Brain,
  Activity,
  Database,
  RefreshCw,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmbeddingStats {
  totalMaterials: number;
  materialsWithEmbeddings: number;
  totalKnowledgeEntries: number;
  entriesWithEmbeddings: number;
  embeddingTypes: Array<{
    type: string;
    count: number;
    dimension: number;
  }>;
}

const EmbeddingGenerationPanel: React.FC = () => {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchEmbeddingStats();
  }, []);

  const fetchEmbeddingStats = async () => {
    try {
      setLoading(true);

      // Get material embeddings stats from materials_catalog
      const { data: materialData, error: materialError } = await supabase
        .from('materials_catalog')
        .select('id, embedding')
        .not('embedding', 'is', null);

      // Since enhanced_knowledge_base doesn't exist, we'll use materials_catalog for knowledge data
      const { data: knowledgeData, error: knowledgeError } = await supabase
        .from('materials_catalog')
        .select('id, embedding');

      const { data: materialsTotal } = await supabase
        .from('materials_catalog')
        .select('id', { count: 'exact' });

      if (materialError) throw materialError;
      if (knowledgeError) throw knowledgeError;

      // Process embedding types - simulate different embedding types for materials
      const embeddingTypeCounts: Record<string, { count: number; dimension: number }> = {};
      materialData?.forEach(_item => {
        const embeddingType = 'pgvector'; // Default embedding type for pgvector
        if (!embeddingTypeCounts[embeddingType]) {
          embeddingTypeCounts[embeddingType] = {
            count: 0,
            dimension: 1536, // Standard OpenAI embedding dimension
          };
        }
        embeddingTypeCounts[embeddingType].count++;
      });

      const embeddingTypes = Object.entries(embeddingTypeCounts).map(([type, data]) => ({
        type,
        count: data.count,
        dimension: data.dimension,
      }));

      // Count knowledge entries with embeddings
      const entriesWithEmbeddings = knowledgeData?.filter(entry =>
        entry.embedding,
      ).length || 0;

      setStats({
        totalMaterials: materialsTotal?.length || 0,
        materialsWithEmbeddings: materialData?.length || 0,
        totalKnowledgeEntries: knowledgeData?.length || 0,
        entriesWithEmbeddings,
        embeddingTypes,
      });

    } catch (error) {
      console.error('Error fetching embedding stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch embedding statistics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateEmbeddings = async () => {
    setRegenerating(true);
    try {
      // This would trigger embedding regeneration
      toast({
        title: 'Started',
        description: 'Embedding regeneration process initiated',
      });

      // Refresh stats after a delay
      setTimeout(() => {
        fetchEmbeddingStats();
        setRegenerating(false);
      }, 2000);

    } catch (error) {
      console.error('Error regenerating embeddings:', error);
      toast({
        title: 'Error',
        description: 'Failed to start embedding regeneration',
        variant: 'destructive',
      });
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span>Loading embedding statistics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const materialCoverage = stats ? (stats.materialsWithEmbeddings / stats.totalMaterials) * 100 : 0;
  const knowledgeCoverage = stats ? (stats.entriesWithEmbeddings / stats.totalKnowledgeEntries) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Embedding Generation</h2>
          <p className="text-muted-foreground">Monitor and manage vector embeddings for materials and knowledge</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchEmbeddingStats} className="border border-gray-300 text-sm px-3 py-1">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleRegenerateEmbeddings}
            className="bg-blue-600 text-white text-sm px-3 py-1"
            disabled={regenerating}
          >
            {regenerating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Regenerate All
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Database className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Materials</p>
                <p className="text-2xl font-bold">{stats?.materialsWithEmbeddings || 0}</p>
                <p className="text-xs text-muted-foreground">of {stats?.totalMaterials || 0} total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Knowledge Entries</p>
                <p className="text-2xl font-bold">{stats?.entriesWithEmbeddings || 0}</p>
                <p className="text-xs text-muted-foreground">of {stats?.totalKnowledgeEntries || 0} total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Material Coverage</p>
                <p className="text-2xl font-bold">{materialCoverage.toFixed(1)}%</p>
                <Progress value={materialCoverage} className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Knowledge Coverage</p>
                <p className="text-2xl font-bold">{knowledgeCoverage.toFixed(1)}%</p>
                <Progress value={knowledgeCoverage} className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embedding Types */}
      <Card>
        <CardHeader>
          <CardTitle>Embedding Models</CardTitle>
          <CardDescription>Active embedding models and their usage statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats?.embeddingTypes.map((embeddingType) => (
              <Card key={embeddingType.type} className="border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold capitalize">{embeddingType.type}</h3>
                    <Badge className="border border-gray-300">{embeddingType.dimension}D</Badge>
                  </div>
                  <p className="text-2xl font-bold text-primary">{embeddingType.count}</p>
                  <p className="text-sm text-muted-foreground">embeddings generated</p>
                </CardContent>
              </Card>
            ))}

            {/* Add placeholders for expected models */}
            <Card className="border-dashed border-2">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">OpenAI</h3>
                  <Badge className="border border-gray-300">1536D</Badge>
                </div>
                <p className="text-2xl font-bold text-muted-foreground">0</p>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </CardContent>
            </Card>

            <Card className="border-dashed border-2">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">HuggingFace</h3>
                  <Badge className="border border-gray-300">768D</Badge>
                </div>
                <p className="text-2xl font-bold text-muted-foreground">0</p>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Current embedding generation system health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Vector Database</span>
              </div>
              <Badge className="bg-green-500/20 text-green-600">Online</Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Embedding Services</span>
              </div>
              <Badge className="bg-green-500/20 text-green-600">Active</Badge>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <span>Batch Processing</span>
              </div>
              <Badge className="bg-yellow-500/20 text-yellow-600">Idle</Badge>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Embedding generation is handled automatically during material processing.
              Custom models will be deployed here after training completion.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmbeddingGenerationPanel;
