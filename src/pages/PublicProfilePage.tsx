import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Globe,
  MapPin,
  Briefcase,
  Building2,
  Lock,
  ExternalLink,
  Mail,
  Star,
  Tag,
  DollarSign,
  Link as LinkIcon,
  Pencil,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Grid3x3,
  UserCircle,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { HireMeModal } from '@/components/core/Profile/HireMeModal';
import type { ServiceItem } from '@/components/core/Profile/ProfileTab';
import { FollowButton } from '@/components/features/social/FollowButton';
import { MoodboardComments } from '@/components/features/social/MoodboardComments';
import { ReviewsSection } from '@/components/features/profile/ReviewsSection';
import { BookingWidget } from '@/components/features/profile/BookingWidget';
import { PROFESSIONAL_TYPE_LABELS } from '@/lib/materialCategories';

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

interface ReviewStats {
  overall: number;
  count: number;
  dimensions: Record<string, number>;
  summary: string | null;
}

interface PublicMoodboard {
  id: string;
  title: string;
  description?: string;
  updated_at: string;
  preview_url?: string;
}

const DIMENSIONS: { key: string; label: string }[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'value', label: 'Value' },
];

const CARD_COLORS = [
  'from-violet-100 to-indigo-100',
  'from-blue-100 to-cyan-100',
  'from-rose-100 to-pink-100',
  'from-amber-100 to-orange-100',
  'from-emerald-100 to-teal-100',
  'from-purple-100 to-fuchsia-100',
];

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30 fill-muted-foreground/10'}`}
        />
      ))}
    </span>
  );
}

function ServiceRow({
  service,
  onHire,
  isLast,
}: {
  service: ServiceItem;
  onHire: (serviceId: string) => void;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = service.description || (service.previous_work?.length ?? 0) > 0;

  return (
    <div className={`px-5 py-4 ${!isLast ? 'border-b' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{service.name}</span>
            {service.price && (
              <Badge variant="secondary" className="text-xs gap-1 px-1.5">
                <DollarSign className="h-2.5 w-2.5" />{service.price}
              </Badge>
            )}
          </div>
          {service.description && !expanded && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{service.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasDetails && (
            <button
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs rounded-full gap-1 px-3"
            onClick={() => onHire(service.id)}>
            <Mail className="h-3 w-3" />Hire
          </Button>
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="mt-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
          {service.description && <p>{service.description}</p>}
          {(service.previous_work?.length ?? 0) > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium flex items-center gap-1 text-foreground/60">
                <LinkIcon className="h-3 w-3" /> Previous Work
              </p>
              {service.previous_work!.map((w, i) => (
                <div key={i} className="text-xs">
                  {w.url ? (
                    <a href={w.url} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1">
                      {w.title}<ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span>{w.title}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export const PublicProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [moodboards, setMoodboards] = useState<PublicMoodboard[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
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

      // Fire-and-forget analytics
      supabase.rpc('increment_profile_views', { p_user_id: userId! }).then(() => {});
      supabase.from('analytics_events').insert({
        event_type: 'profile_viewed',
        user_id: null,
        metadata: { profile_user_id: userId, professional_type: profileData.professional_type },
        created_at: new Date().toISOString(),
      }).then(() => {});

      const [
        { count: fwrCount },
        { count: fwgCount },
        { data: reviewsData },
        { data: summaryData },
      ] = await Promise.all([
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
        supabase.from('profile_reviews').select('overall_rating, dimension_ratings').eq('to_user_id', userId!),
        supabase.from('review_summaries').select('summary_text').eq('user_id', userId!).maybeSingle(),
      ]);
      setFollowerCount(fwrCount ?? 0);
      setFollowingCount(fwgCount ?? 0);

      if (reviewsData && reviewsData.length > 0) {
        const overall = reviewsData.reduce((s: number, r: { overall_rating: number }) => s + r.overall_rating, 0) / reviewsData.length;
        const dimTotals: Record<string, { sum: number; count: number }> = {};
        reviewsData.forEach((r: { dimension_ratings: Record<string, number> }) => {
          Object.entries(r.dimension_ratings ?? {}).forEach(([k, v]) => {
            if (!dimTotals[k]) dimTotals[k] = { sum: 0, count: 0 };
            dimTotals[k].sum += Number(v);
            dimTotals[k].count += 1;
          });
        });
        const dimensions: Record<string, number> = {};
        Object.entries(dimTotals).forEach(([k, v]) => { dimensions[k] = v.sum / v.count; });
        setReviewStats({ overall, count: reviewsData.length, dimensions, summary: summaryData?.summary_text ?? null });
      }

      // Public moodboards + preview images
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
                .from('image_product_associations')
                .select('document_images(image_url)')
                .eq('product_id', items[0].material_id)
                .order('overall_score', { ascending: false })
                .limit(1)
                .maybeSingle();
              preview_url = (rel as any)?.document_images?.image_url;
            }
            return { ...mb, preview_url };
          })
        );
        setMoodboards(enriched);
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
        <p className="text-muted-foreground max-w-xs">This profile is either private or doesn't exist.</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    );
  }

  const initials = (profile.full_name || 'U')
    .split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

  const displayName = profile.full_name || 'Anonymous';
  const isOwnProfile = user?.id === profile.user_id;

  const richServices: ServiceItem[] =
    profile.services_detail.length > 0
      ? profile.services_detail
      : profile.services.map((name, i) => ({ id: String(i), name }));

  return (
    <div className="min-h-screen bg-[#f7f6f4]">

      {/* ── Navbar ───────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm ring-1 ring-amber-400/30">
              <span className="text-primary-foreground font-light text-xs">J</span>
            </div>
            <span className="font-light text-sm tracking-tight text-foreground group-hover:text-primary transition-colors">
              JARVIS
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <Link to="/discover" className="text-muted-foreground hover:text-foreground transition-colors">Browse</Link>
            {isOwnProfile && (
              <Button asChild size="sm" variant="outline" className="rounded-full gap-1.5">
                <Link to="/profile"><Pencil className="h-3 w-3" />Edit Profile</Link>
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Gradient banner ──────────────────────────────────────────────────── */}
      <div
        className="h-28 sm:h-36 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(330,43%,18%) 0%, hsl(280,35%,38%) 50%, hsl(260,50%,60%) 100%)' }}
      >
        <div className="absolute -top-12 -left-12 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 right-1/3 w-80 h-80 rounded-full bg-white/8 blur-3xl pointer-events-none" />
        <div className="absolute top-8 right-16 w-40 h-40 rounded-full bg-accent/20 blur-2xl pointer-events-none" />
      </div>

      {/* ── White profile card ───────────────────────────────────────────────── */}
      <div className="bg-white shadow-sm relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Name row — avatar inline, pulled up slightly over the banner */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pt-0 pb-4">
            {/* Left: avatar + name/meta */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Avatar — pulled up over the banner */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white shadow-xl overflow-hidden bg-primary shrink-0 -mt-10 sm:-mt-12">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-2xl font-light text-primary-foreground">{initials}</span>
                  </div>
                )}
              </div>
              {/* Name + meta */}
              <div className="min-w-0 pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
                  {profile.professional_type && (
                    <Badge className="text-xs rounded-full bg-primary/10 text-primary border-primary/20 font-normal">
                      {PROFESSIONAL_TYPE_LABELS[profile.professional_type] ?? profile.professional_type}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  {profile.company && <span>{profile.company}</span>}
                  {profile.company && profile.location && <span className="text-muted-foreground/40">·</span>}
                  {profile.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />{profile.location}
                    </span>
                  )}
                </p>
                {profile.bio && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2 max-w-lg">{profile.bio}</p>
                )}
              </div>
            </div>

            {/* Action buttons (right) */}
            <div className="flex items-center gap-2 shrink-0 pt-3">
              <FollowButton
                targetUserId={profile.user_id}
                currentUserId={user?.id}
                onToggle={(nowFollowing) => setFollowerCount((c) => c + (nowFollowing ? 1 : -1))}
              />
              <Button className="rounded-full gap-2 px-5" onClick={() => openHireModal()}>
                <Mail className="h-4 w-4" />
                Hire Me
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-8 pb-4 border-t pt-4">
            <div className="text-center cursor-default">
              <p className="text-lg font-semibold tabular-nums">{followerCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Followers</p>
            </div>
            <div className="text-center cursor-default">
              <p className="text-lg font-semibold tabular-nums">{followingCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Following</p>
            </div>
            {moodboards.length > 0 && (
              <div className="text-center cursor-default">
                <p className="text-lg font-semibold tabular-nums">{moodboards.length}</p>
                <p className="text-xs text-muted-foreground">Boards</p>
              </div>
            )}
            {reviewStats && (
              <div className="flex items-center gap-1.5 cursor-default">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />
                <div>
                  <p className="text-lg font-semibold tabular-nums leading-none">{reviewStats.overall.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">{reviewStats.count} reviews</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <Tabs defaultValue="about" className="mt-5">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
              <TabsTrigger value="about" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <UserCircle className="h-4 w-4" /> About
              </TabsTrigger>
              <TabsTrigger value="moodboards" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Grid3x3 className="h-4 w-4" /> Moodboards
                {moodboards.length > 0 && <span className="text-xs opacity-70">{moodboards.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="skills" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Tag className="h-4 w-4" /> Skills
                {profile.skill_tags.length > 0 && <span className="text-xs opacity-70">{profile.skill_tags.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="services" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Briefcase className="h-4 w-4" /> Services
                {richServices.length > 0 && <span className="text-xs opacity-70">{richServices.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="reviews" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Star className="h-4 w-4" /> Reviews
                {reviewStats && <span className="text-xs opacity-70">{reviewStats.count}</span>}
              </TabsTrigger>
            </TabsList>

            {/* ── About ─────────────────────────────────────────────────── */}
            <TabsContent value="about" className="mt-5 space-y-4">
              {/* Bio */}
              {profile.bio && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-primary">
                      <UserCircle className="h-4 w-4" /> Bio
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
                  </CardContent>
                </Card>
              )}

              {/* Contact / links */}
              {(profile.website_url || profile.location) && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-5 space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-primary">
                      <Globe className="h-4 w-4" /> Contact & Location
                    </h3>
                    {profile.location && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />{profile.location}
                      </p>
                    )}
                    {profile.website_url && (
                      <a href={profile.website_url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-2">
                        <Globe className="h-4 w-4 shrink-0" />
                        {profile.website_url}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* AI Review Summary */}
              {reviewStats?.summary && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> AI Summary
                    </h3>
                    <p className="text-sm text-foreground/80 leading-relaxed">{reviewStats.summary}</p>
                    {DIMENSIONS.filter((d) => reviewStats.dimensions[d.key] != null).length > 0 && (
                      <div className="border-t pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {DIMENSIONS.filter((d) => reviewStats.dimensions[d.key] != null).map((d) => (
                          <div key={d.key} className="text-center space-y-1">
                            <StarRow rating={reviewStats.dimensions[d.key]} />
                            <p className="text-xs text-muted-foreground">{d.label}</p>
                            <p className="text-xs font-medium tabular-nums">{reviewStats.dimensions[d.key].toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Preferred Factories */}
              {profile.preferred_factories.length > 0 && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-primary">
                      <Building2 className="h-4 w-4" /> Preferred Factories
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {profile.preferred_factories.map((f, i) => (
                        <div key={i} className="rounded-xl bg-muted/40 p-3">
                          <p className="font-medium text-sm">{f.name}</p>
                          {f.country && <p className="text-xs text-muted-foreground mt-0.5">{f.country}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty about */}
              {!profile.bio && !profile.website_url && !profile.location && !reviewStats?.summary && profile.preferred_factories.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {isOwnProfile ? (
                    <>
                      <p className="text-sm">Your profile is empty.</p>
                      <Button asChild variant="outline" size="sm" className="rounded-full mt-3">
                        <Link to="/profile"><Pencil className="h-3.5 w-3.5 mr-1" />Edit Profile</Link>
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm">Nothing shared yet.</p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── Moodboards ────────────────────────────────────────────── */}
            <TabsContent value="moodboards" className="mt-5">
              {moodboards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Grid3x3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  {isOwnProfile ? (
                    <>
                      <p className="font-medium text-foreground mb-1">No public moodboards yet</p>
                      <p className="text-sm text-muted-foreground mb-4">Make a moodboard public to show it here.</p>
                      <Button asChild variant="outline" size="sm" className="rounded-full">
                        <Link to="/moodboard">Open Moodboards</Link>
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">No moodboards shared yet.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {moodboards.map((mb, i) => (
                    <div key={mb.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                      <div className={`aspect-[4/3] overflow-hidden relative ${!mb.preview_url ? `bg-gradient-to-br ${CARD_COLORS[i % CARD_COLORS.length]}` : ''}`}>
                        {mb.preview_url ? (
                          <img
                            src={mb.preview_url}
                            alt={mb.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-3xl font-light text-foreground/30">
                              {mb.title.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-4 space-y-2">
                        <div>
                          <p className="font-medium text-sm leading-tight">{mb.title}</p>
                          {mb.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{mb.description}</p>
                          )}
                        </div>
                        <button
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => setExpandedComments(expandedComments === mb.id ? null : mb.id)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {expandedComments === mb.id ? 'Hide comments' : 'Comments'}
                        </button>
                        {expandedComments === mb.id && (
                          <MoodboardComments moodboardId={mb.id} currentUserId={user?.id} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Skills ────────────────────────────────────────────────── */}
            <TabsContent value="skills" className="mt-5">
              {profile.skill_tags.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{isOwnProfile ? 'Add skills from your profile settings.' : 'No skills listed yet.'}</p>
                  {isOwnProfile && (
                    <Button asChild variant="outline" size="sm" className="rounded-full mt-3">
                      <Link to="/profile"><Pencil className="h-3.5 w-3.5 mr-1" />Edit Profile</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                      {profile.skill_tags.map((tag, i) => {
                        const width = 45 + ((i * 17 + 31) % 50);
                        return (
                          <div key={tag} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-foreground/80">{tag}</span>
                              <span className="text-xs text-muted-foreground">{width}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-primary/10 overflow-hidden">
                              <div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Services ──────────────────────────────────────────────── */}
            <TabsContent value="services" className="mt-5 space-y-5">
              {richServices.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{isOwnProfile ? 'Add services from your profile settings.' : 'No services listed yet.'}</p>
                  {isOwnProfile && (
                    <Button asChild variant="outline" size="sm" className="rounded-full mt-3">
                      <Link to="/profile"><Pencil className="h-3.5 w-3.5 mr-1" />Edit Profile</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <Card className="rounded-2xl border-0 shadow-sm">
                    <CardContent className="p-0 divide-y">
                      {richServices.map((svc, i) => (
                        <ServiceRow key={svc.id} service={svc} onHire={openHireModal} isLast={i === richServices.length - 1} />
                      ))}
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl border-0 shadow-sm">
                    <CardContent className="p-5">
                      <BookingWidget
                        profileUserId={profile.user_id}
                        profileName={displayName}
                        services={richServices.map((s) => ({ id: s.id, name: s.name }))}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ── Reviews ───────────────────────────────────────────────── */}
            <TabsContent value="reviews" className="mt-5">
              <ReviewsSection
                profileUserId={profile.user_id}
                currentUserId={user?.id}
                services={richServices.map((s) => ({ id: s.id, name: s.name }))}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="h-16" />

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
