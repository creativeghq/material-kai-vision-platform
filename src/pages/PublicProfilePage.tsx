import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Globe,
  MapPin,
  Briefcase,
  Grid3x3,
  Building2,
  Lock,
  ExternalLink,
  Mail,
  Star,
  Tag,
  Eye,
  Users,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Link as LinkIcon,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { HireMeModal } from '@/components/core/Profile/HireMeModal';
import type { ServiceItem } from '@/components/core/Profile/ProfileTab';
import { FollowButton } from '@/components/features/social/FollowButton';
import { MoodboardComments } from '@/components/features/social/MoodboardComments';

const PROFESSIONAL_TYPE_LABELS: Record<string, string> = {
  designer: 'Designer',
  interior_designer: 'Interior Designer',
  architect: 'Architect',
  manufacturer: 'Manufacturer',
  brand: 'Brand',
  supplier: 'Supplier',
  sourcing_agent: 'Sourcing Agent',
  consultant: 'Consultant',
  other: 'Other',
};

interface PublicProfile {
  user_id: string;
  full_name: string;
  company: string;
  bio: string;
  avatar_url: string;
  location: string;
  website_url: string;
  services: string[];
  services_detail: ServiceItem[];
  preferred_factories: { name: string; country?: string }[];
  skill_tags: string[];
  featured_moodboard_id: string | null;
  profile_views: number;
  professional_type: string | null;
}

interface PublicMoodboard {
  id: string;
  title: string;
  description?: string;
  updated_at: string;
  preview_url?: string;
}

// ─── Public service card (read-only) ─────────────────────────────────────────
function PublicServiceCard({
  service,
  onHire,
}: {
  service: ServiceItem;
  onHire: (serviceId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    service.description || (service.previous_work?.length ?? 0) > 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{service.name}</p>
            {service.price && (
              <Badge variant="secondary" className="mt-1 text-xs gap-1">
                <DollarSign className="h-2.5 w-2.5" />
                {service.price}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs gap-1.5"
            onClick={() => onHire(service.id)}>
            <Mail className="h-3.5 w-3.5" />
            Hire
          </Button>
        </div>

        {service.description && !expanded && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {service.description}
          </p>
        )}
      </div>

      {hasDetails && (
        <>
          {expanded && (
            <div className="px-4 pb-3 space-y-3 border-t pt-3">
              {service.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {service.description}
                </p>
              )}
              {(service.previous_work?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                    <LinkIcon className="h-3 w-3" /> Previous Work
                  </p>
                  {service.previous_work!.map((w, i) => (
                    <div key={i} className="text-xs">
                      {w.url ? (
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {w.title}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{w.title}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground border-t transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> Show details</>
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export const PublicProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [moodboards, setMoodboards] = useState<PublicMoodboard[]>([]);
  const [featuredBoard, setFeaturedBoard] = useState<PublicMoodboard | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [hireMeOpen, setHireMeOpen] = useState(false);
  const [preselectedServiceId, setPreselectedServiceId] = useState<string | undefined>();
  const [expandedComments, setExpandedComments] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    loadProfile();
  }, [userId]);

  const openHireModal = (serviceId?: string) => {
    setPreselectedServiceId(serviceId);
    setHireMeOpen(true);
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select(
          'user_id, full_name, company, bio, avatar_url, location, website_url, services, services_detail, preferred_factories, skill_tags, featured_moodboard_id, profile_views, professional_type, is_public'
        )
        .eq('user_id', userId)
        .eq('is_public', true)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile({
        ...profileData,
        services: profileData.services ?? [],
        services_detail: (profileData.services_detail as ServiceItem[]) ?? [],
        preferred_factories: (profileData.preferred_factories as { name: string; country?: string }[]) ?? [],
        skill_tags: profileData.skill_tags ?? [],
        featured_moodboard_id: profileData.featured_moodboard_id ?? null,
        profile_views: profileData.profile_views ?? 0,
        professional_type: profileData.professional_type ?? null,
      });

      // Increment view counter (fire-and-forget)
      supabase.rpc('increment_profile_views', { p_user_id: userId! }).then(() => {});

      // Follower count
      const { count } = await supabase
        .from('user_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);
      setFollowerCount(count ?? 0);

      // Public moodboards
      const { data: mbData } = await supabase
        .from('moodboards')
        .select('id, title, description, updated_at')
        .eq('user_id', userId)
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(12);

      if (mbData) {
        const enriched = await Promise.all(
          mbData.map(async (mb) => {
            const { data: items } = await supabase
              .from('moodboard_items')
              .select('material_id')
              .eq('moodboard_id', mb.id)
              .order('position', { ascending: true })
              .limit(1);

            let preview_url: string | undefined;
            if (items?.[0]?.material_id) {
              const { data: rel } = await supabase
                .from('product_image_relationships')
                .select('document_images(image_url)')
                .eq('product_id', items[0].material_id)
                .order('relevance_score', { ascending: false })
                .limit(1)
                .maybeSingle();
              // @ts-expect-error nested select typing
              preview_url = rel?.document_images?.image_url;
            }
            return { ...mb, preview_url };
          })
        );
        setMoodboards(enriched);

        // Set featured board if any
        if (profileData.featured_moodboard_id) {
          const fb = enriched.find((m) => m.id === profileData.featured_moodboard_id);
          setFeaturedBoard(fb ?? null);
        }
      }
    } catch (err) {
      console.error('Error loading public profile:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Profile not found</h2>
        <p className="text-muted-foreground max-w-xs">
          This profile is either private or doesn't exist.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    );
  }

  const initials = (profile.full_name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  const displayName = profile.full_name || 'Anonymous';
  const nonFeaturedBoards = moodboards.filter((m) => m.id !== profile.featured_moodboard_id);

  // Use services_detail if available, otherwise fall back to name-only list
  const richServices: ServiceItem[] =
    profile.services_detail.length > 0
      ? profile.services_detail
      : profile.services.map((name, i) => ({ id: String(i), name }));

  return (
    <div className="min-h-screen bg-background">
      {/* Hero / Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <Avatar className="h-24 w-24 shrink-0 text-2xl">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
              <AvatarFallback className="bg-primary/20 text-primary font-bold text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold truncate">{displayName}</h1>
                {profile.professional_type && (
                  <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                    {PROFESSIONAL_TYPE_LABELS[profile.professional_type] ?? profile.professional_type}
                  </Badge>
                )}
              </div>
              {profile.company && (
                <p className="text-muted-foreground text-sm mt-0.5">{profile.company}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {profile.location}
                  </span>
                )}
                {followerCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {followerCount} follower{followerCount !== 1 ? 's' : ''}
                  </span>
                )}
                {profile.website_url && (
                  <a
                    href={profile.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {profile.bio && (
                <p className="mt-3 text-sm leading-relaxed max-w-prose">{profile.bio}</p>
              )}
            </div>

            <div className="flex gap-2 shrink-0">
              <FollowButton targetUserId={profile.user_id} currentUserId={user?.id} />
              <Button size="lg" onClick={() => openHireModal()}>
                <Mail className="h-4 w-4 mr-2" />
                Hire Me
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">

        {/* Skill Tags */}
        {profile.skill_tags.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Tag className="h-5 w-5 text-primary" />
              Skills & Expertise
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.skill_tags.map((t) => (
                <Badge key={t} className="text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20">
                  {t}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Services — rich cards */}
        {richServices.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Briefcase className="h-5 w-5 text-primary" />
              Services
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {richServices.map((svc) => (
                <PublicServiceCard
                  key={svc.id}
                  service={svc}
                  onHire={openHireModal}
                />
              ))}
            </div>
          </section>
        )}

        {/* Featured Moodboard */}
        {featuredBoard && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Star className="h-5 w-5 text-amber-500" />
              Featured Board
            </h2>
            <Card className="rounded-2xl overflow-hidden">
              {featuredBoard.preview_url && (
                <div className="aspect-video relative overflow-hidden">
                  <img
                    src={featuredBoard.preview_url}
                    alt={featuredBoard.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-base">{featuredBoard.title}</h3>
                  {featuredBoard.description && (
                    <p className="text-sm text-muted-foreground mt-1">{featuredBoard.description}</p>
                  )}
                </div>
                <MoodboardComments moodboardId={featuredBoard.id} currentUserId={user?.id} />
              </CardContent>
            </Card>
          </section>
        )}

        {/* Preferred Factories */}
        {profile.preferred_factories.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-primary" />
              Preferred Factories
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {profile.preferred_factories.map((f, i) => (
                <Card key={i} className="rounded-xl">
                  <CardContent className="p-3">
                    <p className="font-medium text-sm">{f.name}</p>
                    {f.country && (
                      <p className="text-xs text-muted-foreground mt-0.5">{f.country}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* All Public Moodboards */}
        {nonFeaturedBoards.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Grid3x3 className="h-5 w-5 text-primary" />
              Moodboards
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {nonFeaturedBoards.map((mb) => (
                <Card key={mb.id} className="rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                  {mb.preview_url && (
                    <div className="aspect-video relative overflow-hidden">
                      <img
                        src={mb.preview_url}
                        alt={mb.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-medium">{mb.title}</p>
                      {mb.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mb.description}</p>
                      )}
                    </div>
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => setExpandedComments(expandedComments === mb.id ? null : mb.id)}
                    >
                      {expandedComments === mb.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      Comments
                    </button>
                    {expandedComments === mb.id && (
                      <MoodboardComments moodboardId={mb.id} currentUserId={user?.id} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {moodboards.length === 0 &&
          richServices.length === 0 &&
          profile.preferred_factories.length === 0 &&
          profile.skill_tags.length === 0 && (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Eye className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Nothing shared yet.</p>
              </CardContent>
            </Card>
          )}
      </div>

      <HireMeModal
        open={hireMeOpen}
        onOpenChange={setHireMeOpen}
        toUserId={profile.user_id}
        toUserName={displayName}
        services={richServices}
        preselectedServiceId={preselectedServiceId}
      />
    </div>
  );
};
