import React, { useState } from 'react';
import { 
  Upload, 
  Search, 
  Grid3X3, 
  Eye, 
  Brain, 
  Settings, 
  User, 
  Bell, 
  Home,
  Archive,
  Palette,
  Database,
  Activity,
  Plus,
  Filter,
  RefreshCw,
  Download,
  Share2,
  Star,
  Heart,
  Camera,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const mockMaterials = [
    { id: 1, name: 'Marble White', category: 'Stone', confidence: 0.94, image: '/placeholder.svg' },
    { id: 2, name: 'Oak Wood', category: 'Wood', confidence: 0.89, image: '/placeholder.svg' },
    { id: 3, name: 'Steel Brushed', category: 'Metal', confidence: 0.96, image: '/placeholder.svg' },
    { id: 4, name: 'Ceramic Blue', category: 'Ceramic', confidence: 0.91, image: '/placeholder.svg' },
  ];

  const mockRecognitionHistory = [
    { id: 1, material: 'Granite Black', timestamp: '2 hours ago', confidence: 0.92 },
    { id: 2, material: 'Pine Wood', timestamp: '4 hours ago', confidence: 0.88 },
    { id: 3, material: 'Aluminum Matte', timestamp: '6 hours ago', confidence: 0.95 },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">KAI Platform</span>
          </div>
          
          <div className="ml-8 flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input 
                placeholder="Search materials, projects, or settings..." 
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="ml-auto flex items-center space-x-4">
            <Button variant="ghost" size="icon">
              <Bell className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <User className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card min-h-screen">
          <nav className="p-4 space-y-2">
            <Button 
              variant={activeTab === 'dashboard' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('dashboard')}
            >
              <Home className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button 
              variant={activeTab === 'recognition' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('recognition')}
            >
              <Eye className="w-4 h-4 mr-2" />
              Recognition
            </Button>
            <Button 
              variant={activeTab === 'catalog' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('catalog')}
            >
              <Archive className="w-4 h-4 mr-2" />
              Material Catalog
            </Button>
            <Button 
              variant={activeTab === 'moodboard' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('moodboard')}
            >
              <Palette className="w-4 h-4 mr-2" />
              MoodBoards
            </Button>
            <Button 
              variant={activeTab === '3d' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('3d')}
            >
              <Grid3X3 className="w-4 h-4 mr-2" />
              3D Visualization
            </Button>
            <Button 
              variant={activeTab === 'agents' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('agents')}
            >
              <Brain className="w-4 h-4 mr-2" />
              AI Agents
            </Button>
            <Button 
              variant={activeTab === 'analytics' ? 'default' : 'ghost'} 
              className="w-full justify-start"
              onClick={() => setActiveTab('analytics')}
            >
              <Activity className="w-4 h-4 mr-2" />
              Analytics
            </Button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Welcome to KAI Platform - Your material intelligence hub</p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Materials Recognized</CardTitle>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">1,247</div>
                    <p className="text-xs text-muted-foreground">+12% from last month</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Catalog Items</CardTitle>
                    <Database className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">8,432</div>
                    <p className="text-xs text-muted-foreground">+248 this week</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Average Confidence</CardTitle>
                    <Brain className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">94.2%</div>
                    <p className="text-xs text-muted-foreground">+2.1% improvement</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
                    <Grid3X3 className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">23</div>
                    <p className="text-xs text-muted-foreground">5 completed this week</p>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button className="h-24 flex flex-col items-center justify-center space-y-2">
                      <Upload className="w-6 h-6" />
                      <span>Upload & Recognize</span>
                    </Button>
                    <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-2">
                      <Plus className="w-6 h-6" />
                      <span>New MoodBoard</span>
                    </Button>
                    <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-2">
                      <Grid3X3 className="w-6 h-6" />
                      <span>3D Scene Viewer</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Recognition History */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Recognition Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mockRecognitionHistory.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                            <Eye className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium">{item.material}</p>
                            <p className="text-sm text-muted-foreground">{item.timestamp}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {Math.round(item.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'recognition' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">Material Recognition</h1>
                <p className="text-muted-foreground">Upload images for AI-powered material identification</p>
              </div>

              {/* Upload Area */}
              <Card>
                <CardContent className="p-8">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Upload Material Images</h3>
                    <p className="text-muted-foreground mb-4">Drag and drop your images here, or click to select files</p>
                    <Button>Select Files</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Recognition Results */}
              <Card>
                <CardHeader>
                  <CardTitle>Recognition Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {mockMaterials.map((material) => (
                      <div key={material.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                          <Camera className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h4 className="font-medium">{material.name}</h4>
                        <p className="text-sm text-muted-foreground">{material.category}</p>
                        <Badge className="mt-2">
                          {Math.round(material.confidence * 100)}% match
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'catalog' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">Material Catalog</h1>
                  <p className="text-muted-foreground">Browse and manage your material library</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="icon">
                    <Filter className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Material
                  </Button>
                </div>
              </div>

              {/* Filter Tabs */}
              <Tabs defaultValue="all" className="w-full">
                <TabsList>
                  <TabsTrigger value="all">All Materials</TabsTrigger>
                  <TabsTrigger value="stone">Stone</TabsTrigger>
                  <TabsTrigger value="wood">Wood</TabsTrigger>
                  <TabsTrigger value="metal">Metal</TabsTrigger>
                  <TabsTrigger value="ceramic">Ceramic</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {mockMaterials.map((material) => (
                      <Card key={material.id} className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardContent className="p-4">
                          <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                            <Camera className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <h4 className="font-medium">{material.name}</h4>
                          <p className="text-sm text-muted-foreground">{material.category}</p>
                          <div className="flex items-center justify-between mt-3">
                            <Badge variant="outline">{material.category}</Badge>
                            <div className="flex space-x-1">
                              <Button variant="ghost" size="icon">
                                <Heart className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon">
                                <Share2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {activeTab === 'moodboard' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">MoodBoards</h1>
                  <p className="text-muted-foreground">Create and manage design inspiration boards</p>
                </div>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New MoodBoard
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center">
                        <Palette className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h4 className="font-medium">Modern Kitchen Design</h4>
                      <p className="text-sm text-muted-foreground">12 materials • Updated 2 days ago</p>
                      <div className="flex items-center justify-between mt-3">
                        <Badge variant="outline">Kitchen</Badge>
                        <div className="flex space-x-1">
                          <Button variant="ghost" size="icon">
                            <Star className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Share2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeTab === '3d' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">3D Visualization</h1>
                <p className="text-muted-foreground">Interactive 3D material preview and scene reconstruction</p>
              </div>

              <Card>
                <CardContent className="p-8">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Grid3X3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">3D Scene Viewer</h3>
                      <p className="text-muted-foreground mb-4">Upload images for 3D scene reconstruction</p>
                      <Button>Load 3D Scene</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">AI Agents</h1>
                <p className="text-muted-foreground">Intelligent assistants for material recognition and design</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Eye className="w-5 h-5 mr-2" />
                      Recognition Assistant
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">AI agent specialized in material identification and classification</p>
                    <Badge className="mb-4">Active</Badge>
                    <Button className="w-full">Chat with Agent</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Grid3X3 className="w-5 h-5 mr-2" />
                      3D Designer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">Spatial reasoning agent for room layout and furniture placement</p>
                    <Badge className="mb-4">Active</Badge>
                    <Button className="w-full">Chat with Agent</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Brain className="w-5 h-5 mr-2" />
                      Material Expert
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">Domain expert providing material knowledge and recommendations</p>
                    <Badge className="mb-4">Active</Badge>
                    <Button className="w-full">Chat with Agent</Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">Analytics</h1>
                <p className="text-muted-foreground">Performance metrics and insights</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Recognition Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">94.2%</div>
                    <p className="text-xs text-muted-foreground">+2.1% from last week</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Processing Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">1.8s</div>
                    <p className="text-xs text-muted-foreground">-0.3s improvement</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Daily Recognitions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">347</div>
                    <p className="text-xs text-muted-foreground">+12% from yesterday</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Agent Interactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">156</div>
                    <p className="text-xs text-muted-foreground">+8% from last week</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recognition Performance Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
                    <p className="text-muted-foreground">Chart visualization would go here</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Index;