import React, { useEffect, useState } from 'react';
import { Search, Users, MapPin, Briefcase, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Card, CardContent } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FollowButton } from '@/components/features/social/FollowButton';

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

interface PublicCreator {
  user_id: string;
  full_name?: string;
  company?: string;
  bio?: string;
  avatar_url?: string;
  location?: string;
  website_url?: string;
  services: string[];
  skill_tags: string[];
  profile_views: number;
  professional_type?: string | null;
  follower_count?: number;
}

export const DiscoverPage: React.FC = () => {
  const { user } = useAuth();
  const [creators, setCreators] = useState<PublicCreator[]>([]);
  const [filtered, setFiltered] = useState<PublicCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    loadCreators();
  }, []);

  useEffect(() => {
    let result = creators;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.full_name?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.bio?.toLowerCase().includes(q) ||
          c.services.some((s) => s.toLowerCase().includes(q)) ||
          c.skill_tags.some((t) => t.toLowerCase().includes(q)) ||
          c.location?.toLowerCase().includes(q)
      );
    }
    if (activeTag) {
      result = result.filter(
        (c) =>
          c.services.includes(activeTag) ||
          c.skill_tags.includes(activeTag) ||
          (c.professional_type && PROFESSIONAL_TYPE_LABELS[c.professional_type] === activeTag)
      );
    }
    setFiltered(result);
  }, [search, activeTag, creators]);

  const loadCreators = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, company, bio, avatar_url, location, website_url, services, skill_tags, profile_views, professional_type')
      .eq('is_public', true)
      .order('profile_views', { ascending: false })
      .limit(60);

    if (data) {
      // Get follower counts
      const userIds = data.map((p) => p.user_id);
      const { data: follows } = await supabase
        .from('user_follows')
        .select('following_id')
        .in('following_id', userIds);

      const countMap: Record<string, number> = {};
      follows?.forEach((f) => {
        countMap[f.following_id] = (countMap[f.following_id] ?? 0) + 1;
      });

      const enriched = data.map((p) => ({
        ...p,
        services: p.services ?? [],
        skill_tags: p.skill_tags ?? [],
        follower_count: countMap[p.user_id] ?? 0,
      }));
      setCreators(enriched);
      setFiltered(enriched);
    }
    setLoading(false);
  };

  // Collect all unique tags: professional types first, then services + skill_tags
  const professionalTypeFilters = Array.from(
    new Set(
      creators
        .filter((c) => c.professional_type)
        .map((c) => PROFESSIONAL_TYPE_LABELS[c.professional_type!] ?? c.professional_type!)
    )
  );
  const allTags = Array.from(
    new Set([
      ...professionalTypeFilters,
      ...creators.flatMap((c) => [...c.services, ...c.skill_tags]),
    ])
  ).slice(0, 24);

  const initials = (name?: string) =>
    (name || '?').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Discover Creators
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse public profiles, find designers, architects, and sourcing specialists.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, service, location…"
          className="pl-9"
        />
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeTag === tag
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No creators found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((creator) => (
            <Card key={creator.user_id} className="rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Link to={`/u/${creator.user_id}`} className="shrink-0">
                    <Avatar className="h-12 w-12">
                      {creator.avatar_url && <AvatarImage src={creator.avatar_url} />}
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {initials(creator.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        to={`/u/${creator.user_id}`}
                        className="font-semibold text-sm hover:text-primary transition-colors truncate"
                      >
                        {creator.full_name || 'Anonymous'}
                      </Link>
                      {creator.professional_type && (
                        <Badge className="text-xs px-1.5 py-0 bg-primary/10 text-primary border-primary/20 shrink-0">
                          {PROFESSIONAL_TYPE_LABELS[creator.professional_type] ?? creator.professional_type}
                        </Badge>
                      )}
                    </div>
                    {creator.company && (
                      <p className="text-xs text-muted-foreground truncate">{creator.company}</p>
                    )}
                    {creator.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" /> {creator.location}
                      </p>
                    )}
                  </div>
                </div>

                {creator.bio && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{creator.bio}</p>
                )}

                {creator.services.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {creator.services.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs px-2 py-0">
                        {s}
                      </Badge>
                    ))}
                    {creator.services.length > 3 && (
                      <Badge variant="outline" className="text-xs px-2 py-0">
                        +{creator.services.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {creator.follower_count !== undefined && creator.follower_count > 0 && (
                      <span>{creator.follower_count} follower{creator.follower_count !== 1 ? 's' : ''}</span>
                    )}
                    {creator.website_url && (
                      <a
                        href={creator.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <FollowButton targetUserId={creator.user_id} currentUserId={user?.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
