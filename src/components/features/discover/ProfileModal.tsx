import React, { useEffect, useState } from 'react';
import {
  Globe, MapPin, Briefcase, Building2, ExternalLink, Mail, Star, Tag,
  DollarSign, Link as LinkIcon, Pencil, Sparkles, ChevronDown, ChevronUp,
  MessageCircle, Grid3x3, UserCircle, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/core/ui/dialog';
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

const CARD_COLORS = [
  'from-violet-100 to-indigo-100',
  'from-blue-100 to-cyan-100',
  'from-rose-100 to-pink-100',
  'from-amber-100 to-orange-100',
  'from-emerald-100 to-teal-100',
  'from-purple-100 to-fuchsia-100',
];

const DIMENSIONS = [
  { key: 'communication', label: 'Communication' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'value', label: 'Value' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ServiceRow({ service, onHire, isLast }: { service: ServiceItem; onHire: (id: string) => void; isLast: boolean }) {
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
            <button className="text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setExpanded((v) => !v)}>
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
                  ) : <span>{w.title}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── ProfileModal ─────────────────────────────────────────────────────────────

interface ProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

export function ProfileModal({ userId, onClose }: ProfileModalProps) {
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [moodboards, setMoodboards] = useState<PublicMoodboard[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [hireMeOpen, setHireMeOpen] = useState(false);
  const [preselectedServiceId, setPreselectedServiceId] = useState<string | undefined>();
  const [expandedComments, setExpandedComments] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    loadProfile(userId);
  }, [userId]);

  const openHireModal = (serviceId?: string) => {
    setPreselectedServiceId(serviceId);
    setHireMeOpen(true);
  };

  const loadProfile = async (uid: string) => {
    setLoading(true);
    setProfile(null);
    setMoodboards([]);
    setReviewStats(null);

    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, company, bio, avatar_url, location, website_url, services, services_detail, preferred_factories, skill_tags, featured_moodboard_id, profile_views, professional_type, is_public')
        .eq('user_id', uid)
        .eq('is_public', true)
        .maybeSingle();

      if (!profileData) { setLoading(false); return; }

      setProfile({
        ...profileData,
        services: profileData.services ?? [],
        services_detail: (profileData.services_detail as ServiceItem[]) ?? [],
        preferred_factories: (profileData.preferred_factories as { name: string; country?: string }[]) ?? [],
        skill_tags: profileData.skill_tags ?? [],
        profile_views: profileData.profile_views ?? 0,
        professional_type: profileData.professional_type ?? null,
      });

      const [
        { count: fwrCount },
        { count: fwgCount },
        { data: reviewsData },
        { data: summaryData },
      ] = await Promise.all([
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
        supabase.from('profile_reviews').select('overall_rating, dimension_ratings').eq('to_user_id', uid),
        supabase.from('review_summaries').select('summary_text').eq('user_id', uid).maybeSingle(),
      ]);
      setFollowerCount(fwrCount ?? 0);
      setFollowingCount(fwgCount ?? 0);

      if (reviewsData && reviewsData.length > 0) {
        const overall = reviewsData.reduce((s: number, r: any) => s + r.overall_rating, 0) / reviewsData.length;
        const dimTotals: Record<string, { sum: number; count: number }> = {};
        reviewsData.forEach((r: any) => {
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

      const { data: mbData } = await supabase
        .from('moodboards')
        .select('id, title, description, updated_at')
        .eq('user_id', uid)
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(12);

      if (mbData) {
        const enriched = await Promise.all(
          mbData.map(async (mb) => {
            const { data: items } = await supabase
              .from('moodboard_items').select('material_id').eq('moodboard_id', mb.id)
              .order('position', { ascending: true }).limit(1);
            let preview_url: string | undefined;
            if (items?.[0]?.material_id) {
              const { data: rel } = await supabase
                .from('image_product_associations').select('document_images(image_url)')
                .eq('product_id', items[0].material_id)
                .order('overall_score', { ascending: false }).limit(1).maybeSingle();
              preview_url = (rel as any)?.document_images?.image_url;
            }
            return { ...mb, preview_url };
          }),
        );
        setMoodboards(enriched);
      }
    } finally {
      setLoading(false);
    }
  };

  const isOpen = !!userId;
  if (!isOpen) return null;

  const displayName = profile?.full_name || 'Anonymous';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((s: string) => s[0].toUpperCase()).join('');
  const isOwnProfile = user?.id === profile?.user_id;
  const richServices: ServiceItem[] = profile
    ? (profile.services_detail.length > 0
        ? profile.services_detail
        : profile.services.map((name, i) => ({ id: String(i), name })))
    : [];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent hideClose className="w-[95vw] max-w-3xl p-0 overflow-hidden rounded-2xl gap-0 max-h-[90vh] flex flex-col">

          {/* ── Banner ──────────────────────────────────────────────────────── */}
          <div
            className="h-28 sm:h-36 relative overflow-hidden shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(330,43%,18%) 0%, hsl(280,35%,38%) 50%, hsl(260,50%,60%) 100%)' }}
          >
            <div className="absolute -top-12 -left-12 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 right-1/3 w-80 h-80 rounded-full bg-white/8 blur-3xl pointer-events-none" />
            <div className="absolute top-8 right-16 w-40 h-40 rounded-full bg-accent/20 blur-2xl pointer-events-none" />

            {/* Top-right buttons */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {userId && (
                <Link
                  to={`/u/${userId}`}
                  onClick={onClose}
                  className="h-7 px-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Public Page
                </Link>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 flex-1">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !profile ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Profile not found or private.</p>
          </div>
        ) : (
          <Tabs defaultValue="about" className="flex flex-col flex-1 min-h-0">
            {/* ── White profile header — outside overflow-y so avatar isn't clipped ── */}
            <div className="bg-white shadow-sm shrink-0 relative z-10">
              <div className="px-3 sm:px-6">
                {/* Avatar + name row */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Avatar pulled up over banner */}
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
                        <h2 className="text-xl font-semibold tracking-tight">{displayName}</h2>
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

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-3">
                    <FollowButton
                      targetUserId={profile.user_id}
                      currentUserId={user?.id}
                      onToggle={(nowFollowing) => setFollowerCount((c) => c + (nowFollowing ? 1 : -1))}
                    />
                    <Button className="rounded-full gap-2 px-4" size="sm" onClick={() => openHireModal()}>
                      <Mail className="h-3.5 w-3.5" />Hire Me
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 sm:gap-8 py-4 border-t mt-4">
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

                {/* Tabs nav */}
                <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-1 bg-muted/50 rounded-xl mb-2">
                  <TabsTrigger value="about" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                    <UserCircle className="h-3.5 w-3.5" /> About
                  </TabsTrigger>
                  <TabsTrigger value="moodboards" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                    <Grid3x3 className="h-3.5 w-3.5" /> Moodboards
                    {moodboards.length > 0 && <span className="text-xs opacity-70">{moodboards.length}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="skills" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                    <Tag className="h-3.5 w-3.5" /> Skills
                  </TabsTrigger>
                  <TabsTrigger value="services" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                    <Briefcase className="h-3.5 w-3.5" /> Services
                  </TabsTrigger>
                  <TabsTrigger value="reviews" className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                    <Star className="h-3.5 w-3.5" /> Reviews
                    {reviewStats && <span className="text-xs opacity-70">{reviewStats.count}</span>}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* ── Scrollable tab content ────────────────────────────────────── */}
            <div className="overflow-y-auto flex-1 bg-[#f7f6f4]">
              <div className="px-3 sm:px-6 py-4">
                {/* ── About ──────────────────────────────────────────── */}
                <TabsContent value="about" className="mt-0 space-y-4 pb-6">
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
                        {!profile.bio && !profile.website_url && !profile.location && !reviewStats?.summary && profile.preferred_factories.length === 0 && (
                          <div className="py-12 text-center text-muted-foreground">
                            <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            {isOwnProfile ? (
                              <>
                                <p className="text-sm">Your profile is empty.</p>
                                <Button asChild variant="outline" size="sm" className="rounded-full mt-3">
                                  <Link to="/profile" onClick={onClose}><Pencil className="h-3.5 w-3.5 mr-1" />Edit Profile</Link>
                                </Button>
                              </>
                            ) : (
                              <p className="text-sm">Nothing shared yet.</p>
                            )}
                          </div>
                        )}
                      </TabsContent>

                      {/* ── Moodboards ─────────────────────────────────────── */}
                      <TabsContent value="moodboards" className="mt-4 pb-6">
                        {moodboards.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Grid3x3 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                            <p className="text-muted-foreground text-sm">No moodboards shared yet.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {moodboards.map((mb, i) => (
                              <div key={mb.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                                <div className={`aspect-[4/3] overflow-hidden relative ${!mb.preview_url ? `bg-gradient-to-br ${CARD_COLORS[i % CARD_COLORS.length]}` : ''}`}>
                                  {mb.preview_url ? (
                                    <img src={mb.preview_url} alt={mb.title}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <span className="text-3xl font-light text-foreground/30">{mb.title.slice(0, 2).toUpperCase()}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="p-4 space-y-2">
                                  <p className="font-medium text-sm leading-tight">{mb.title}</p>
                                  {mb.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">{mb.description}</p>
                                  )}
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

                      {/* ── Skills ─────────────────────────────────────────── */}
                      <TabsContent value="skills" className="mt-4 pb-6">
                        {profile.skill_tags.length === 0 ? (
                          <div className="py-12 text-center text-muted-foreground">
                            <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No skills listed yet.</p>
                          </div>
                        ) : (
                          <Card className="rounded-2xl border-0 shadow-sm">
                            <CardContent className="p-5">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-4">
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

                      {/* ── Services ───────────────────────────────────────── */}
                      <TabsContent value="services" className="mt-4 space-y-4 pb-6">
                        {richServices.length === 0 ? (
                          <div className="py-12 text-center text-muted-foreground">
                            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No services listed yet.</p>
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

                      {/* ── Reviews ────────────────────────────────────────── */}
                      <TabsContent value="reviews" className="mt-0 pb-6">
                        <ReviewsSection
                          profileUserId={profile.user_id}
                          currentUserId={user?.id}
                          services={richServices.map((s) => ({ id: s.id, name: s.name }))}
                        />
                      </TabsContent>
                    </div>
                  </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {profile && (
        <HireMeModal
          open={hireMeOpen}
          onOpenChange={setHireMeOpen}
          toUserId={profile.user_id}
          toUserName={displayName}
          services={richServices}
          preselectedServiceId={preselectedServiceId}
        />
      )}
    </>
  );
}
