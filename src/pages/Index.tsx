
import React from 'react';
import { ArrowRight, Play, CheckCircle, Sparkles, Box, Brain, Eye, Layers, Users, Shield, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      {/* Navigation */}
      <nav className="relative z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">KAI Platform</span>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#demo" className="text-gray-300 hover:text-white transition-colors">Demo</a>
            <a href="#enterprise" className="text-gray-300 hover:text-white transition-colors">Enterprise</a>
            <Button variant="outline" className="text-white border-white hover:bg-white hover:text-slate-900">
              Sign In
            </Button>
            <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-3xl"></div>
        <div className="relative max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm text-white mb-8">
            <Sparkles className="w-4 h-4 mr-2" />
            Next-generation material recognition platform
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Enterprise-Grade
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent block">
              Material Intelligence
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed">
            Combine ML-powered material recognition, 3D visualization, AI agent orchestration, 
            and comprehensive catalog management in one sophisticated platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-lg px-8 py-6"
            >
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-white border-white hover:bg-white hover:text-slate-900 text-lg px-8 py-6"
            >
              <Play className="mr-2 w-5 h-5" />
              Watch Demo
            </Button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 text-center">
            <div>
              <div className="text-3xl font-bold text-white mb-2">94%+</div>
              <div className="text-gray-400">Recognition Accuracy</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">&lt;2s</div>
              <div className="text-gray-400">Processing Time</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">1M+</div>
              <div className="text-gray-400">Materials Cataloged</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">99.9%</div>
              <div className="text-gray-400">Uptime SLA</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-20 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Comprehensive Platform Capabilities</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Eight integrated packages delivering enterprise-grade material intelligence
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 group">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Eye className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">ML-Powered Recognition</h3>
                <p className="text-gray-300 mb-4">
                  Advanced MaterialNet models with 94%+ accuracy, confidence scoring, and real-time processing.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Multiple model architectures</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Vector similarity search</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />SVBRDF property extraction</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 group">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Box className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">3D Visualization</h3>
                <p className="text-gray-300 mb-4">
                  Advanced scene reconstruction with NeRF, Three.js integration, and interactive material previews.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />COLMAP integration</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Real-time PBR rendering</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Interactive scene exploration</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 group">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">AI Agent System</h3>
                <p className="text-gray-300 mb-4">
                  CrewAI-powered agents for recognition assistance, 3D design, and material expertise.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Recognition Assistant</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />3D Designer Agent</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Material Expert</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 group">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Layers className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Catalog Management</h3>
                <p className="text-gray-300 mb-4">
                  Comprehensive material catalog with MoodBoard functionality and design workflows.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Advanced search & filtering</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Collaborative MoodBoards</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Design template system</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 group">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Enterprise Security</h3>
                <p className="text-gray-300 mb-4">
                  Network access control, role-based permissions, and enterprise-grade security features.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Network access control</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Role-based permissions</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Audit logging</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all duration-300 group">
              <CardContent className="p-8">
                <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Analytics & Monitoring</h3>
                <p className="text-gray-300 mb-4">
                  Comprehensive monitoring, analytics, and performance optimization with real-time insights.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Real-time monitoring</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Performance analytics</li>
                  <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-400" />Custom dashboards</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">See KAI Platform In Action</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Experience the power of intelligent material recognition and 3D visualization
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold text-white mb-6">Material Recognition Workflow</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">1</div>
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Upload Material Image</h4>
                    <p className="text-gray-300">Drag and drop or upload images of materials for instant recognition</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-sm">2</div>
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">AI Processing</h4>
                    <p className="text-gray-300">Multiple ML models analyze the material with confidence scoring</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm">3</div>
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">3D Visualization</h4>
                    <p className="text-gray-300">View materials in 3D with accurate SVBRDF properties</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-sm">4</div>
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Smart Recommendations</h4>
                    <p className="text-gray-300">AI agents provide expert recommendations and design suggestions</p>
                  </div>
                </div>
              </div>
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 mt-8"
              >
                Try Interactive Demo
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-r from-blue-500/20 to-purple-600/20 rounded-2xl p-8 backdrop-blur-sm border border-white/20">
                <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-white mx-auto mb-4 opacity-70" />
                    <p className="text-gray-300">Interactive Demo</p>
                    <p className="text-sm text-gray-500">Click to experience the platform</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Section */}
      <section id="enterprise" className="px-6 py-20 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Built for Enterprise</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Scalable, secure, and reliable platform designed for enterprise workloads
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Scalable Architecture</h3>
              <p className="text-gray-300">Kubernetes-based deployment handling 1000+ concurrent users with auto-scaling</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Enterprise Security</h3>
              <p className="text-gray-300">Network access control, role-based permissions, and comprehensive audit logging</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">99.9% Uptime</h3>
              <p className="text-gray-300">Production-ready with comprehensive monitoring, alerting, and disaster recovery</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl p-12 text-center backdrop-blur-sm border border-white/20">
            <h3 className="text-3xl font-bold text-white mb-4">Ready to Transform Your Material Workflow?</h3>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Join leading enterprises using KAI Platform for intelligent material recognition and design workflows
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-lg px-8 py-6"
              >
                Schedule Enterprise Demo
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-white border-white hover:bg-white hover:text-slate-900 text-lg px-8 py-6"
              >
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">KAI Platform</span>
              </div>
              <p className="text-gray-400 mb-6">
                Enterprise-grade material recognition and catalog management with ML-powered intelligence.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center text-gray-400">
            <p>&copy; 2024 KAI Platform. All rights reserved.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
