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
  Pencil,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { HireMeModal } from '@/components/core/Profile/HireMeModal';
import type { ServiceItem } from '@/components/core/Profile/ProfileTab';
import { FollowButton } from '@/components/features/social/FollowButton';
import { MoodboardComments } from '@/components/features/social/MoodboardComments';
import { ReviewsSection } from '@/components/features/profile/ReviewsSection';
import { BookingWidget } from '@/components/features/profile/BookingWidget';

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

interface ReviewStats {
  overall: number;
  count: number;
  dimensions: Record<string, number>;
  summary: string | null;
}

const DIMENSIONS: { key: string; label: string }[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'value', label: 'Value' },
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

interface PublicMoodboard {
  id: string;
  title: string;
  description?: string;
  updated_at: string;
  preview_url?: string;
}

// ─── Service row (HealthRate visit-reason style) ──────────────────────────────
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
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [moodboards, setMoodboards] = useState<PublicMoodboard[]>([]);
  const [featuredBoard, setFeaturedBoard] = useState<PublicMoodboard | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
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

      // Increment view counter + analytics (fire-and-forget)
      supabase.rpc('increment_profile_views', { p_user_id: userId! }).then(() => {});
      supabase.from('analytics_events').insert({
        event_type: 'profile_viewed',
        user_id: null,
        metadata: { profile_user_id: userId, professional_type: profileData.professional_type },
        created_at: new Date().toISOString(),
      }).then(() => {});

      // Follower count + review stats in parallel
      const [{ count }, { data: reviewsData }, { data: summaryData }] = await Promise.all([
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('profile_reviews').select('overall_rating, dimension_ratings').eq('to_user_id', userId!),
        supabase.from('review_summaries').select('summary_text').eq('user_id', userId!).maybeSingle(),
      ]);
      setFollowerCount(count ?? 0);

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
      {/* ── Nav bar ──────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/25 ring-1 ring-amber-400/40 transition-transform group-hover:scale-105">
              <span className="text-primary-foreground font-light text-sm">K</span>
            </div>
            <span className="font-light text-base tracking-tight text-foreground group-hover:text-primary transition-colors">
              KAI Platform
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/discover" className="hover:text-foreground transition-colors">Browse</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── ROW 1: Hero card — avatar + info + booking ──────────────────── */}
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row gap-0">

              {/* Avatar */}
              <div className="sm:w-48 md:w-56 shrink-0 bg-primary/5">
                <div className="aspect-square w-full h-full flex items-center justify-center">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-6xl font-light text-primary">{initials}</span>
                  )}
                </div>
              </div>

              {/* Info + actions */}
              <div className="flex-1 min-w-0 p-6 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <h1 className="text-2xl font-light tracking-tight">{displayName}</h1>
                    {(profile.professional_type || profile.company) && (
                      <p className="text-sm text-primary mt-0.5">
                        {[
                          profile.professional_type
                            ? (PROFESSIONAL_TYPE_LABELS[profile.professional_type] ?? profile.professional_type)
                            : null,
                          profile.company,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>

                  {profile.bio && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{profile.bio}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    {profile.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        {profile.location}
                      </span>
                    )}
                    {followerCount > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                        {followerCount} follower{followerCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {profile.website_url && (
                      <a
                        href={profile.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-primary transition-colors"
                      >
                        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                        Website
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Review score badge */}
                {reviewStats && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-medium text-primary">{reviewStats.overall.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">({reviewStats.count} review{reviewStats.count !== 1 ? 's' : ''})</span>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button className="rounded-full gap-2 px-6" onClick={() => openHireModal()}>
                    <Mail className="h-4 w-4" />
                    Hire Me
                  </Button>
                  <FollowButton targetUserId={profile.user_id} currentUserId={user?.id} />
                </div>
              </div>

              {/* Booking widget — right panel of the hero card */}
              <div className="sm:w-[28rem] shrink-0 border-t sm:border-t-0 sm:border-l bg-card/50 p-4 flex items-start">
                <BookingWidget
                  profileUserId={profile.user_id}
                  profileName={displayName}
                  services={richServices.map((s) => ({ id: s.id, name: s.name }))}
                />
              </div>

            </div>
          </CardContent>
        </Card>

        {/* ── ROW 2: AI Summary (if available) ────────────────────────────── */}
        {(reviewStats?.summary || (reviewStats && DIMENSIONS.filter(d => reviewStats.dimensions[d.key] != null).length > 0)) && (
          <Card className="rounded-2xl border">
            <CardContent className="p-5 space-y-4">
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  {reviewStats?.summary && (
                    <>
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5" /> AI Summary
                      </p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{reviewStats.summary}</p>
                    </>
                  )}
                </div>
              </div>
              {reviewStats && DIMENSIONS.filter((d) => reviewStats.dimensions[d.key] != null).length > 0 && (
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

        {/* ── ROW 2+: Content sections ─────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Services */}
          {richServices.length > 0 && (
            <section>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Briefcase className="h-4 w-4 text-primary" /> Services
              </h2>
              <Card className="rounded-2xl border">
                <CardContent className="p-0 divide-y">
                  {richServices.map((svc, i) => (
                    <ServiceRow key={svc.id} service={svc} onHire={openHireModal} isLast={i === richServices.length - 1} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Skills & Expertise */}
          {profile.skill_tags.length > 0 && (
            <section>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Tag className="h-4 w-4 text-primary" /> Skills & Expertise
              </h2>
              <Card className="rounded-2xl border">
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {profile.skill_tags.map((tag, i) => {
                    const width = 45 + ((i * 17 + 31) % 50);
                    return (
                      <div key={tag} className="space-y-1">
                        <span className="text-sm text-foreground/80">{tag}</span>
                        <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Preferred Factories */}
          {profile.preferred_factories.length > 0 && (
            <section>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-primary" /> Preferred Factories
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {profile.preferred_factories.map((f, i) => (
                  <Card key={i} className="rounded-xl">
                    <CardContent className="p-3">
                      <p className="font-medium text-sm">{f.name}</p>
                      {f.country && <p className="text-xs text-muted-foreground mt-0.5">{f.country}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Featured Moodboard */}
          {featuredBoard && (
            <section>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-amber-500" /> Featured Board
              </h2>
              <Card className="rounded-2xl overflow-hidden">
                {featuredBoard.preview_url && (
                  <div className="aspect-video overflow-hidden">
                    <img src={featuredBoard.preview_url} alt={featuredBoard.title} className="w-full h-full object-cover" />
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

          {/* Other Moodboards */}
          {nonFeaturedBoards.length > 0 && (
            <section>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Grid3x3 className="h-4 w-4 text-primary" /> Moodboards
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {nonFeaturedBoards.map((mb) => (
                  <Card key={mb.id} className="rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                    {mb.preview_url && (
                      <div className="aspect-video overflow-hidden">
                        <img src={mb.preview_url} alt={mb.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
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
                        {expandedComments === mb.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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

          {/* Empty state */}
          {moodboards.length === 0 && richServices.length === 0 &&
            profile.preferred_factories.length === 0 && profile.skill_tags.length === 0 && !profile.bio && (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <Eye className="h-8 w-8 mx-auto opacity-30" />
                {user?.id === profile.user_id ? (
                  <>
                    <p className="font-medium text-foreground">Your public profile is empty</p>
                    <p className="text-sm max-w-xs mx-auto">Add skills, services, and moodboards from your profile settings.</p>
                    <Button asChild variant="outline" size="sm" className="rounded-full gap-2 mt-2">
                      <Link to="/profile"><Pencil className="h-3.5 w-3.5" />Edit Profile</Link>
                    </Button>
                  </>
                ) : (
                  <p>Nothing shared yet.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reviews */}
          <ReviewsSection
            profileUserId={profile.user_id}
            currentUserId={user?.id}
            services={richServices.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
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
