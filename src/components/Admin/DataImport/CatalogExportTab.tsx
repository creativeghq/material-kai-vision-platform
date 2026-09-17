import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/utils/edgeError';

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
] as const;

const NO_TEMPLATE = 'none';

export function CatalogExportTab() {
  const { activeWorkspaceId } = useWorkspace();
  const [format, setFormat] = useState<string>('csv');
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [templates, setTemplates] = useState<Array<{ id: string; template_name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    supabase
      .from('xml_mapping_templates')
      .select('id, template_name')
      .eq('workspace_id', activeWorkspaceId)
      .order('template_name')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setTemplates((data ?? []) as Array<{ id: string; template_name: string }>);
      });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  const run = async () => {
    if (!activeWorkspaceId) return;
    setBusy(true);
    try {
      const MAX = 5000;
      const { data, error } = await supabase.functions.invoke('catalog-export', {
        body: {
          workspace_id: activeWorkspaceId,
          format,
          mapping_template_id: templateId === NO_TEMPLATE ? undefined : templateId,
          limit: MAX,
        },
      });
      if (error) {
        throw new Error(await edgeErrorMessage(error, 'The export could not be produced.'));
      }
      const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

      const count = format === 'json'
        ? (Array.isArray(data) ? data.length : 0)
        : text.trim().split('\n').length - (format === 'csv' ? 1 : 0);
      if (count >= MAX) {
        toast({
          title: 'Export is capped at 5,000 products',
          description: 'This catalogue is at or over the limit, so the file may be incomplete.',
        });
      }
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `catalogue-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'The export service could not be reached.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base">Export the catalogue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          Active products only. Cost, margin and supplier links are never included — a partner
          price list is a separate decision with its own audience.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="export-format">Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger id="export-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="export-template">Channel field names</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="export-template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>Our own column names</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {templates.length > 0 && (
          <p className="text-xs text-muted-foreground">
            A mapping template is applied in reverse: the pairs that taught the importer a
            partner&apos;s vocabulary rename our columns on the way back out.
          </p>
        )}

        <Button onClick={() => void run()} disabled={busy || !activeWorkspaceId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-2">{busy ? 'Exporting…' : 'Export'}</span>
        </Button>
      </CardContent>
    </Card>
  );
}
