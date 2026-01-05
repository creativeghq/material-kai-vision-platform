/**
 * Email Template Builder Page
 * Build email templates using React Email components
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Code } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const EmailTemplateBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<any>(null);
  const [formData, setFormData] = useState({
    subject: '',
    react_code: '',
    variables: [] as string[],
  });

  useEffect(() => {
    if (id) {
      loadTemplate();
    }
  }, [id]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setTemplate(data);
      setFormData({
        subject: data.subject || '',
        react_code: data.react_code || getDefaultReactTemplate(),
        variables: data.variables || [],
      });
    } catch (error) {
      console.error('Error loading template:', error);
      toast({
        title: 'Error',
        description: 'Failed to load template',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getDefaultReactTemplate = () => {
    return `import { Html, Head, Body, Container, Heading, Text, Button, Hr } from '@react-email/components';

export default function EmailTemplate({ userName = 'User', actionUrl = '#', companyName = 'Material Kai' }) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: '#f4f4f4', fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', padding: '20px' }}>
          <Heading style={{ color: '#000000', fontSize: '24px', textAlign: 'center', marginBottom: '20px' }}>
            {companyName}
          </Heading>

          <Hr style={{ borderColor: '#e0e0e0', margin: '20px 0' }} />

          <Heading as="h2" style={{ color: '#333333', fontSize: '20px', marginBottom: '15px' }}>
            Hello {userName}!
          </Heading>

          <Text style={{ color: '#666666', fontSize: '16px', lineHeight: '1.6', marginBottom: '20px' }}>
            Welcome to our platform. We're excited to have you on board!
          </Text>

          <Button
            href={actionUrl}
            style={{
              backgroundColor: '#000000',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '4px',
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: 'bold',
            }}
          >
            Get Started
          </Button>

          <Hr style={{ borderColor: '#e0e0e0', margin: '30px 0 20px 0' }} />

          <Text style={{ color: '#999999', fontSize: '12px', textAlign: 'center' }}>
            © 2024 {companyName}. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}`;
  };

  const extractVariables = (code: string) => {
    const match = code.match(/function\s+\w+\s*\(\s*\{([^}]+)\}/);
    if (!match) return [];

    const propsString = match[1];
    const vars = propsString
      .split(',')
      .map(prop => prop.trim().split('=')[0].trim())
      .filter(v => v.length > 0);

    return vars;
  };

  const handleCodeChange = (value: string) => {
    setFormData({
      ...formData,
      react_code: value,
      variables: extractVariables(value),
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('email_templates')
        .update({
          subject: formData.subject,
          react_code: formData.react_code,
          variables: formData.variables,
          is_active: true,
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Template saved successfully',
      });
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: 'Failed to save template',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Template not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{template.name}</h1>
            <p className="text-sm text-muted-foreground">{template.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
          <TabsTrigger value="editor" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Code className="h-4 w-4 mr-2" />
            React Code
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>React Email Template</CardTitle>
              <CardDescription>
                Write your email template using React Email components. Available components: Html, Head, Body, Container, Heading, Text, Button, Hr, Img, Link, Section, Row, Column
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Welcome {{userName}}!"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="react-code">React Email Code</Label>
                <Textarea
                  id="react-code"
                  value={formData.react_code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  rows={25}
                  className="font-mono text-sm"
                  placeholder="Write your React Email template here..."
                />
              </div>

              {formData.variables.length > 0 && (
                <div className="p-4 rounded-lg border bg-muted/50">
                  <p className="text-sm font-medium mb-2">Detected Props/Variables:</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.variables.map((variable) => (
                      <code key={variable} className="px-2 py-1 rounded bg-background text-xs">
                        {variable}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    These props will be available when sending emails using this template
                  </p>
                </div>
              )}

              <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-950">
                <p className="text-sm font-medium mb-2">💡 Tips:</p>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Use inline styles for email compatibility</li>
                  <li>• Define props with default values in the function signature</li>
                  <li>• Import components from '@react-email/components'</li>
                  <li>• Test your template by sending a test email</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Template Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Template Name</Label>
                  <p className="text-sm text-muted-foreground">{template.name}</p>
                </div>
                <div>
                  <Label>Slug</Label>
                  <p className="text-sm text-muted-foreground">{template.slug}</p>
                </div>
                <div>
                  <Label>Category</Label>
                  <p className="text-sm text-muted-foreground capitalize">{template.category}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <p className="text-sm text-muted-foreground">
                    {template.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmailTemplateBuilder;
