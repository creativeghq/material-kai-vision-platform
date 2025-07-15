import React from 'react';
import { SearchHub } from './SearchHub';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Database, 
  Brain, 
  Sparkles, 
  Upload,
  Star,
  Package,
  Palette,
  Zap,
  Target,
  TrendingUp,
  Shield
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* Hero Section with Modern Gradient */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative px-6 py-16 text-center space-y-8">
          <div className="animate-float">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              Powered by Advanced AI
            </div>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-gradient leading-tight">
            Material Intelligence
            <br />
            <span className="text-4xl md:text-6xl">Agent Platform</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Transform your material workflows with AI-powered PDF knowledge extraction, 
            intelligent search, and autonomous 3D design generation
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
            <Button className="btn-primary-modern text-lg px-8 py-4" onClick={() => window.location.href = '/pdf-processing'}>
              <Upload className="mr-2 h-5 w-5" />
              Start Processing
            </Button>
            <Button variant="outline" className="text-lg px-8 py-4" onClick={() => window.location.href = '/agents'}>
              <Brain className="mr-2 h-5 w-5" />
              AI Studio
            </Button>
          </div>
        </div>
      </div>

      {/* Main Search Interface */}
      <div className="px-6 mb-16">
        <SearchHub 
          onMaterialSelect={(materialId) => {
            console.log('Material selected:', materialId);
          }}
          onNavigateToMoodboard={() => {
            window.location.href = '/moodboard';
          }}
          onNavigateTo3D={() => {
            window.location.href = '/3d';
          }}
        />
      </div>

      {/* Feature Cards */}
      <div className="px-6 mb-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Intelligent Material Processing</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Harness the power of AI to revolutionize your material research and design workflows
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          <Card className="feature-card glass-card cursor-pointer group" onClick={() => window.location.href = '/pdf-processing'}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:animate-pulse-glow">
                  <FileText className="h-8 w-8" />
                </div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Core Engine</span>
              </div>
              <CardTitle className="text-xl">PDF Knowledge Extraction</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Advanced AI-powered document processing with intelligent material recognition and semantic understanding
              </p>
              <div className="flex items-center text-sm text-primary font-medium">
                <Upload className="h-4 w-4 mr-2" />
                Process Documents →
              </div>
            </CardContent>
          </Card>

          <Card className="feature-card glass-card cursor-pointer group" onClick={() => window.location.href = '/3d'}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-purple-500/10 text-purple-500 group-hover:animate-pulse-glow">
                  <Sparkles className="h-8 w-8" />
                </div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">AI Designer</span>
              </div>
              <CardTitle className="text-xl">3D Generation Studio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Generate photorealistic 3D designs with intelligent material suggestions and real-time optimization
              </p>
              <div className="flex items-center text-sm text-purple-500 font-medium">
                <Brain className="h-4 w-4 mr-2" />
                Create Design →
              </div>
            </CardContent>
          </Card>

          <Card className="feature-card glass-card cursor-pointer group" onClick={() => window.location.href = '/moodboard'}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-orange-500/10 text-orange-500 group-hover:animate-pulse-glow">
                  <Palette className="h-8 w-8" />
                </div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Collections</span>
              </div>
              <CardTitle className="text-xl">Smart MoodBoards</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Curate and organize materials with AI-powered recommendations and collaborative features
              </p>
              <div className="flex items-center text-sm text-orange-500 font-medium">
                <Star className="h-4 w-4 mr-2" />
                Build Collection →
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Enhanced System Metrics */}
      <div className="px-6 mb-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-2">Platform Performance</h3>
            <p className="text-muted-foreground">Real-time insights into our AI-powered processing engine</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Card className="glass-card text-center p-6 hover:scale-105 transition-transform">
              <div className="flex items-center justify-center mb-2">
                <Database className="h-6 w-6 text-primary mr-2" />
                <div className="text-3xl font-bold text-primary">1,247</div>
              </div>
              <div className="text-sm text-muted-foreground font-medium">Documents Processed</div>
              <div className="text-xs text-green-500 mt-1">+12% this week</div>
            </Card>
            
            <Card className="glass-card text-center p-6 hover:scale-105 transition-transform">
              <div className="flex items-center justify-center mb-2">
                <Target className="h-6 w-6 text-blue-500 mr-2" />
                <div className="text-3xl font-bold text-blue-500">8,432</div>
              </div>
              <div className="text-sm text-muted-foreground font-medium">Search Queries</div>
              <div className="text-xs text-green-500 mt-1">+24% this week</div>
            </Card>
            
            <Card className="glass-card text-center p-6 hover:scale-105 transition-transform">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-6 w-6 text-purple-500 mr-2" />
                <div className="text-3xl font-bold text-purple-500">94.2%</div>
              </div>
              <div className="text-sm text-muted-foreground font-medium">AI Accuracy</div>
              <div className="text-xs text-green-500 mt-1">+2.1% improved</div>
            </Card>
            
            <Card className="glass-card text-center p-6 hover:scale-105 transition-transform">
              <div className="flex items-center justify-center mb-2">
                <Shield className="h-6 w-6 text-green-500 mr-2" />
                <div className="text-3xl font-bold text-green-500">99.8%</div>
              </div>
              <div className="text-sm text-muted-foreground font-medium">System Uptime</div>
              <div className="text-xs text-green-500 mt-1">Excellent</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};