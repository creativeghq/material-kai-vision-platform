import React, { useState, useEffect, useRef } from 'react';
import { User, Pencil, Save, Loader2, X, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

interface ProfileData {
  full_name: string;
  company: string;
  phone: string;
  address: string;
  bio: string;
  avatar_url: string;
}

const EMPTY_PROFILE: ProfileData = {
  full_name: '',
  company: '',
  phone: '',
  address: '',
  bio: '',
  avatar_url: '',
};

export const ProfileTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>(EMPTY_PROFILE);
  const [formData, setFormData] = useState<ProfileData>(EMPTY_PROFILE);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('full_name, company, phone, address, bio, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const profile = {
          full_name: data.full_name || '',
          company: data.company || '',
          phone: data.phone || '',
          address: data.address || '',
          bio: data.bio || '',
          avatar_url: data.avatar_url || '',
        };
        setProfileData(profile);
        setFormData(profile);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleEdit = () => {
    setFormData({ ...profileData });
    setEditing(true);
  };

  const handleCancel = () => {
    setFormData({ ...profileData });
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: formData.full_name,
          company: formData.company,
          phone: formData.phone,
          address: formData.address,
          bio: formData.bio,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setProfileData({ ...formData });
      setEditing(false);
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Reset input so the same file can be re-selected
    e.target.value = '';

    if (file.size > MAX_AVATAR_SIZE) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 2MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(path);

      // Append cache-bust to force browser refresh
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      setProfileData((prev) => ({ ...prev, avatar_url: publicUrl }));
      setFormData((prev) => ({ ...prev, avatar_url: publicUrl }));
      toast({ title: 'Avatar Updated', description: 'Your profile photo has been updated.' });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: 'Upload Failed',
        description: 'Could not upload your avatar. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const initials = (profileData.full_name || user?.email || '?')
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <div className="space-y-6">
      {/* User Card */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative group shrink-0"
            >
              <Avatar className="h-16 w-16">
                {profileData.avatar_url && (
                  <AvatarImage src={profileData.avatar_url} alt="Profile" />
                )}
                <AvatarFallback className="bg-primary/20 text-xl font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </button>
            <div>
              <p className="text-lg font-semibold">{profileData.full_name || 'No name set'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {profileData.company && (
                <p className="text-sm text-muted-foreground">{profileData.company}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Personal Information
            </CardTitle>
            {!editing ? (
              <Button onClick={handleEdit} size="sm" variant="default">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={handleCancel} size="sm" variant="outline">
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button onClick={handleSave} size="sm" disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Full Name</label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Email Address</label>
                <Input value={user?.email || ''} disabled className="opacity-60" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Phone Number</label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Company</label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Acme Inc."
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs text-muted-foreground">Address</label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main St, City, Country"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs text-muted-foreground">Bio</label>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 gap-x-8">
              <FieldDisplay label="Full Name" value={profileData.full_name} />
              <FieldDisplay label="Email Address" value={user?.email || ''} />
              <FieldDisplay label="Phone Number" value={profileData.phone} />
              <FieldDisplay label="Company" value={profileData.company} />
              <FieldDisplay label="Address" value={profileData.address} />
              <FieldDisplay label="Bio" value={profileData.bio} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}
