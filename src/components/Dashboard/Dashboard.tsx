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
  Palette
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Material Intelligence Platform
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          AI-powered PDF knowledge extraction, intelligent search, and 3D material suggestions
        </p>
      </div>

      {/* Main Search Interface */}
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

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => window.location.href = '/pdf-processing'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <FileText className="h-8 w-8 text-blue-500" />
              <span className="text-sm text-muted-foreground">Core System</span>
            </div>
            <CardTitle className="text-lg">PDF Knowledge</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Upload and process PDF documents for material intelligence
            </p>
            <Button variant="outline" size="sm" className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Upload PDF
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => window.location.href = '/3d'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Sparkles className="h-8 w-8 text-purple-500" />
              <span className="text-sm text-muted-foreground">AI Powered</span>
            </div>
            <CardTitle className="text-lg">3D Generation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Generate 3D designs with intelligent material suggestions
            </p>
            <Button variant="outline" size="sm" className="w-full">
              <Brain className="h-4 w-4 mr-2" />
              Create Design
            </Button>
          </CardContent>
        </Card>


        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => window.location.href = '/moodboard'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Palette className="h-8 w-8 text-orange-500" />
              <span className="text-sm text-muted-foreground">Collections</span>
            </div>
            <CardTitle className="text-lg">MoodBoard</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Create and manage material collections
            </p>
            <Button variant="outline" size="sm" className="w-full">
              <Star className="h-4 w-4 mr-2" />
              Create Board
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">1,247</div>
          <div className="text-sm text-muted-foreground">PDFs Processed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">8,432</div>
          <div className="text-sm text-muted-foreground">Search Queries</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">94.2%</div>
          <div className="text-sm text-muted-foreground">AI Accuracy</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">99.8%</div>
          <div className="text-sm text-muted-foreground">System Uptime</div>
        </div>
      </div>
    </div>
  );
};