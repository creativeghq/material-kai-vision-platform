/**
 * #174 — Workspace Settings (`/settings`). The NON-finance workspace surface:
 *  - Branding: the canonical per-workspace identity (finance_settings, Option A) —
 *    display name + logo + contact line, shared by invoices, quotes, catalog, public.
 *  - Members: who's in the workspace + their role (+ referral/invite via /network).
 *  - Plan & credits: balance + a link to billing.
 * Finance-specific settings stay under Finance → Settings.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Palette, Users, Sparkles, Upload, ImageIcon, Save, ExternalLink } from 'lucide-react';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';

const SECTIONS = [
  { value: 'branding', label: 'Branding', icon: Palette },
  { value: 'members', label: 'Members', icon: Users },
  { value: 'plan', label: 'Plan & credits', icon: Sparkles },
] as const;

const WorkspaceSettingsPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Workspace settings" description="Branding, members and plan for this workspace." badge="Workspace" />
      <div className="p-3 sm:p-6">
        {!activeWorkspaceId ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="branding" orientation="vertical" className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <TabsList className="flex h-auto w-full shrink-0 flex-row flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-52 sm:flex-col sm:flex-nowrap">
              {SECTIONS.map((s) => (
                <TabsTrigger key={s.value} value={s.value} className="w-full justify-start gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <s.icon className="h-4 w-4" /> {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="w-full min-w-0 flex-1">
              <TabsContent value="branding" className="mt-0"><BrandingTab workspaceId={activeWorkspaceId} /></TabsContent>
              <TabsContent value="members" className="mt-0"><MembersTab workspaceId={activeWorkspaceId} /></TabsContent>
              <TabsContent value="plan" className="mt-0"><PlanTab /></TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
};

// ─────────── Branding (canonical workspace identity → finance_settings) ───────────
const BrandingTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('finance_settings').select('business_name, branding_contact_line, business_logo_path').eq('workspace_id', workspaceId).maybeSingle();
    setName(data?.business_name ?? '');
    setContact((data as any)?.branding_contact_line ?? '');
    setLogoPath(data?.business_logo_path ?? null);
    if (data?.business_logo_path) setLogoUrl(supabase.storage.from('generation-images').getPublicUrl(data.business_logo_path).data.publicUrl);
    setLoading(false);
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('finance_settings').upsert({ workspace_id: workspaceId, business_name: name || null, branding_contact_line: contact || null }, { onConflict: 'workspace_id' });
      if (error) throw error;
      toast({ title: 'Branding saved' });
    } catch (err: any) { toast({ title: 'Save failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const upload = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast({ title: 'PNG/JPG/WEBP only', variant: 'destructive' }); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `business-logos/${workspaceId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('generation-images').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      await supabase.from('finance_settings').upsert({ workspace_id: workspaceId, business_logo_path: path }, { onConflict: 'workspace_id' });
      setLogoPath(path);
      setLogoUrl(`${supabase.storage.from('generation-images').getPublicUrl(path).data.publicUrl}?t=${Date.now()}`);
      toast({ title: 'Logo uploaded' });
    } catch (err: any) { toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' }); }
    finally { setUploading(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Brand identity</CardTitle></CardHeader>
      <CardContent className="space-y-4 p-5">
        <p className="text-xs text-muted-foreground">One identity used everywhere this workspace appears to customers — invoices, quotes, the catalog and public share pages.</p>
        <div className="space-y-1">
          <Label className="text-xs">Display name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Atlas Interiors" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Contact line</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. hello@atlasinteriors.gr · +30 210 0000000" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Logo</Label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/20">
              {logoUrl ? <img src={logoUrl} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="h-4 w-4" /> No logo</span>}
            </div>
            <Button size="sm" variant="outline" className="rounded-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} {logoPath ? 'Replace' : 'Upload'} logo
            </Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="rounded-full">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save branding</Button>
      </CardContent>
    </Card>
  );
};

// ─────────── Members ───────────
const MembersTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('workspace_members')
          .select('user_id, role, status, profile:user_profiles!workspace_members_user_id_fkey(full_name, email)')
          .eq('workspace_id', workspaceId)
          .order('role');
        if (error) throw error;
        setRows(data ?? []);
      } catch (err: any) { toast({ title: 'Failed to load members', description: err?.message, variant: 'destructive' }); }
      finally { setLoading(false); }
    })();
  }, [workspaceId, toast]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Members</CardTitle>
        <Link to="/network"><Button size="sm" variant="outline" className="rounded-full">Invite &amp; referral links <ExternalLink className="h-3.5 w-3.5 ml-1" /></Button></Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : rows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">No members.</div>
          : (
            <div className="divide-y divide-border/40">
              {rows.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}</div>
                    {m.profile?.email && <div className="text-xs text-muted-foreground">{m.profile.email}</div>}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
};

// ─────────── Plan & credits ───────────
const PlanTab: React.FC = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('user_credits').select('balance').eq('user_id', user.id).maybeSingle();
      setBalance(data?.balance ?? 0);
      setLoading(false);
    })();
  }, [user]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Plan &amp; credits</CardTitle></CardHeader>
      <CardContent className="space-y-4 p-5">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{balance ?? 0}</span>
              <span className="text-sm text-muted-foreground">credits</span>
            </div>
            <p className="text-xs text-muted-foreground">Credits are consumed by AI generations, e-invoice transmissions and metered marketplace operations.</p>
            <Link to="/billing"><Button size="sm" className="rounded-full"><Sparkles className="h-4 w-4 mr-1" /> Manage plan &amp; top up</Button></Link>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WorkspaceSettingsPage;
