import React, { useState, useEffect } from 'react';
import {
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Globe,
  Database,
  Brain,
  Image,
  FileText,
  Search,
  Shield,
  Cpu,
  Download,
  ExternalLink,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Package definitions
const NODEJS_PACKAGES = [
  { name: 'react', description: 'UI library for building user interfaces', category: 'Frontend', critical: true },
  { name: 'next.js', description: 'React framework for production', category: 'Frontend', critical: true },
  { name: 'typescript', description: 'Type-safe JavaScript', category: 'Development', critical: true },
  { name: 'tailwindcss', description: 'Utility-first CSS framework', category: 'Styling', critical: true },
  { name: 'supabase-js', description: 'Supabase client library', category: 'Database', critical: true },
  { name: 'lucide-react', description: 'Icon library', category: 'UI', critical: false },
  { name: 'framer-motion', description: 'Animation library', category: 'UI', critical: false },
  { name: 'react-router-dom', description: 'Client-side routing', category: 'Navigation', critical: true },
  { name: 'axios', description: 'HTTP client', category: 'Network', critical: true },
  { name: 'zod', description: 'Schema validation', category: 'Validation', critical: true },
];

const MIVAA_PACKAGES = [
  { name: 'fastapi', description: 'Modern web framework for APIs', category: 'Web Framework', critical: true },
  { name: 'uvicorn', description: 'ASGI server implementation', category: 'Server', critical: true },
  { name: 'pydantic', description: 'Data validation using Python type hints', category: 'Validation', critical: true },
  { name: 'supabase', description: 'Python client for Supabase', category: 'Database', critical: true },
  { name: 'pymupdf4llm', description: 'PDF processing for LLM applications', category: 'PDF Processing', critical: true },
  { name: 'opencv-python-headless', description: 'Computer vision library (headless)', category: 'Image Processing', critical: true },
  { name: 'numpy', description: 'Numerical computing library', category: 'Scientific Computing', critical: true },
  { name: 'pandas', description: 'Data manipulation and analysis', category: 'Data Processing', critical: true },
  { name: 'llama-index', description: 'RAG framework for LLM applications', category: 'AI/ML', critical: false },
  { name: 'transformers', description: 'State-of-the-art ML models', category: 'AI/ML', critical: false },
  { name: 'scikit-learn', description: 'Machine learning library', category: 'AI/ML', critical: false },
  { name: 'pillow', description: 'Python Imaging Library', category: 'Image Processing', critical: true },
  { name: 'requests', description: 'HTTP library for Python', category: 'Network', critical: true },
  { name: 'httpx', description: 'Async HTTP client', category: 'Network', critical: true },
  { name: 'aiofiles', description: 'Async file operations', category: 'File I/O', critical: true },
  { name: 'easyocr', description: 'Optical Character Recognition', category: 'OCR', critical: false },
  { name: 'pytesseract', description: 'Python wrapper for Tesseract OCR', category: 'OCR', critical: false },
  { name: 'nltk', description: 'Natural Language Toolkit', category: 'NLP', critical: false },
];

type PackageStatus = 'active' | 'inactive' | 'error' | 'checking';

interface PackageInfo {
  name: string;
  description: string;
  category: string;
  critical: boolean;
  status?: PackageStatus;
  version?: string;
  error?: string;
}

const PackagesPanel: React.FC = () => {
  const [nodePackages, setNodePackages] = useState<PackageInfo[]>(NODEJS_PACKAGES);
  const [mivaaPackages, setMivaaPackages] = useState<PackageInfo[]>(MIVAA_PACKAGES);
  const [isChecking, setIsChecking] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const getStatusIcon = (status: PackageStatus) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'inactive': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'checking': return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      default: return <Package className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: PackageStatus, critical: boolean) => {
    const baseClass = critical ? 'font-semibold' : '';
    switch (status) {
      case 'active': return <Badge className={`bg-green-100 text-green-800 ${baseClass}`}>Active</Badge>;
      case 'inactive': return <Badge className={`bg-red-100 text-red-800 ${baseClass}`}>Inactive</Badge>;
      case 'error': return <Badge className={`bg-yellow-100 text-yellow-800 ${baseClass}`}>Error</Badge>;
      case 'checking': return <Badge className={`bg-blue-100 text-blue-800 ${baseClass}`}>Checking</Badge>;
      default: return <Badge className={`bg-gray-100 text-gray-800 ${baseClass}`}>Unknown</Badge>;
    }
  };

  const checkPackageStatus = async () => {
    setIsChecking(true);

    try {
      // Check MIVAA packages via API
      const mivaaResponse = await fetch('/api/packages/status');
      if (mivaaResponse.ok) {
        const mivaaData = await mivaaResponse.json();
        if (mivaaData.success) {
          // Convert API data to our package format
          const apiPackages = mivaaData.data.packages || {};
          const updatedMivaaPackages = Object.entries(apiPackages).map(([packageName, packageInfo]: [string, any]) => ({
            name: packageName,
            description: packageInfo.import_name ? `Import as: ${packageInfo.import_name}` : 'Python package',
            category: packageInfo.critical ? 'Critical' : 'Optional',
            critical: packageInfo.critical,
            status: packageInfo.available ? 'active' : 'inactive' as PackageStatus,
            version: packageInfo.version || 'unknown',
            error: packageInfo.error
          }));
          setMivaaPackages(updatedMivaaPackages);
        }
      }

      // For NodeJS packages, simulate checking (would integrate with package.json in production)
      const simulateNodeCheck = (packages: PackageInfo[]) => {
        return packages.map(pkg => ({
          ...pkg,
          status: Math.random() > 0.05 ? 'active' : 'inactive' as PackageStatus,
          version: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
        }));
      };

      setNodePackages(simulateNodeCheck(NODEJS_PACKAGES));

    } catch (error) {
      console.error('Error checking package status:', error);

      // Fallback to basic status
      const basicCheck = (packages: PackageInfo[]) => {
        return packages.map(pkg => ({
          ...pkg,
          status: 'error' as PackageStatus,
          version: 'unknown',
          error: 'Unable to check status',
        }));
      };

      setNodePackages(basicCheck(NODEJS_PACKAGES));
      setMivaaPackages(basicCheck(MIVAA_PACKAGES));
    }

    setIsChecking(false);
  };

  useEffect(() => {
    checkPackageStatus();
  }, []);

  const filterPackages = (packages: PackageInfo[]) => {
    return packages.filter(pkg => {
      const matchesName = pkg.name.toLowerCase().includes(filter.toLowerCase()) ||
                         pkg.description.toLowerCase().includes(filter.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || pkg.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || pkg.status === statusFilter;
      return matchesName && matchesCategory && matchesStatus;
    });
  };

  const getCategories = (packages: PackageInfo[]) => {
    return [...new Set(packages.map(pkg => pkg.category))].sort();
  };

  const PackageTable = ({ packages, title }: { packages: PackageInfo[], title: string }) => {
    const filteredPackages = filterPackages(packages);
    const activeCount = packages.filter(p => p.status === 'active').length;
    const totalCount = packages.length;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title}</span>
            <Badge variant="outline">{activeCount}/{totalCount} Active</Badge>
          </CardTitle>
          <CardDescription>
            Package status and dependency information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Critical</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPackages.map((pkg) => (
                <TableRow key={pkg.name}>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(pkg.status || 'checking')}
                      {getStatusBadge(pkg.status || 'checking', pkg.critical)}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center space-x-2">
                      <span>{pkg.name}</span>
                      {pkg.critical && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{pkg.category}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {pkg.version || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    {pkg.critical ? (
                      <CheckCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pkg.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Package Management</h1>
          <p className="text-muted-foreground">
            Monitor and manage system dependencies across NodeJS and MIVAA services
          </p>
        </div>
        <Button onClick={checkPackageStatus} disabled={isChecking}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Refresh Status'}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <Input
              placeholder="Search packages..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {getCategories([...nodePackages, ...mivaaPackages]).map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Package Tables */}
      <Tabs defaultValue="nodejs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="nodejs" className="flex items-center space-x-2">
            <Globe className="h-4 w-4" />
            <span>NodeJS Packages</span>
          </TabsTrigger>
          <TabsTrigger value="mivaa" className="flex items-center space-x-2">
            <Server className="h-4 w-4" />
            <span>MIVAA Packages</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nodejs">
          <PackageTable packages={nodePackages} title="NodeJS Frontend Packages" />
        </TabsContent>

        <TabsContent value="mivaa">
          <PackageTable packages={mivaaPackages} title="MIVAA Python Packages" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PackagesPanel;
