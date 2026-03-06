import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, BookOpen, Users, Factory, ArrowRight, FileText, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LatestMaterial {
  id: string;
  name: string;
  brand: string | null;
  created_at: string;
  image_url?: string;
}

interface LatestDocument {
  id: string;
  title: string | null;
  filename: string;
  created_at: string;
}

interface LatestProfile {
  user_id: string;
  full_name: string;
  professional_type: string | null;
  location: string | null;
  avatar_url: string | null;
}

interface LatestFactory {
  user_id: string;
  full_name: string;
  company: string | null;
  professional_type: string | null;
  location: string | null;
  avatar_url: string | null;
}

const PROF_LABELS: Record<string, string> = {
  designer: 'Designer', interior_designer: 'Interior Designer', architect: 'Architect',
  manufacturer: 'Manufacturer', brand: 'Brand', supplier: 'Supplier',
  sourcing_agent: 'Sourcing Agent', consultant: 'Consultant', other: 'Other',
};

// ── Widget shell ──────────────────────────────────────────────────────────────
function Widget({
  icon: Icon,
  title,
  viewAllLink,
  loading,
  empty,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  viewAllLink: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-card flex flex-col gap-4 p-5 h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h3>
        <Link
          to={viewAllLink}
          className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-primary/10 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-primary/10 rounded w-3/4" />
                <div className="h-2.5 bg-primary/10 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : empty ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nothing here yet.</p>
      ) : (
        <div className="space-y-3 flex-1">{children}</div>
      )}
    </div>
  );
}

// ── Thumbnail helpers ─────────────────────────────────────────────────────────
function ImageThumb({ src, fallback }: { src?: string | null; fallback: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-9 h-9 rounded-lg object-cover shrink-0 bg-primary/10"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <span className="text-xs font-medium text-primary">
        {fallback.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

// ── Widget: Latest Materials ──────────────────────────────────────────────────
function MaterialsWidget() {
  const [items, setItems] = useState<LatestMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name, brand, created_at')
      .order('created_at', { ascending: false })
      .limit(4)
      .then(async ({ data }) => {
        const products = (data ?? []) as LatestMaterial[];
        // Fetch one image per product
        const withImages = await Promise.all(
          products.map(async (p) => {
            const { data: rel } = await supabase
              .from('product_image_relationships')
              .select('document_images(image_url)')
              .eq('product_id', p.id)
              .order('relevance_score', { ascending: false })
              .limit(1)
              .maybeSingle();
            // @ts-expect-error nested typing
            return { ...p, image_url: rel?.document_images?.image_url };
          })
        );
        setItems(withImages);
        setLoading(false);
      });
  }, []);

  return (
    <Widget icon={Package} title="Latest Materials" viewAllLink="/agent-hub?prompt=Show me the latest and newest materials recently added to the platform" loading={loading} empty={items.length === 0}>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3">
          <ImageThumb src={item.image_url} fallback={item.name} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{item.name}</p>
            {item.brand && (
              <p className="text-xs text-muted-foreground truncate">{item.brand}</p>
            )}
          </div>
        </div>
      ))}
    </Widget>
  );
}

// ── Widget: Latest Knowledge ──────────────────────────────────────────────────
function KnowledgeWidget() {
  const [items, setItems] = useState<LatestDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('documents')
      .select('id, title, filename, created_at')
      .order('created_at', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        setItems((data ?? []) as LatestDocument[]);
        setLoading(false);
      });
  }, []);

  return (
    <Widget icon={BookOpen} title="Latest Knowledge" viewAllLink="/knowledge-base" loading={loading} empty={items.length === 0}>
      {items.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">
              {doc.title || doc.filename}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      ))}
    </Widget>
  );
}

// ── Widget: Latest Profiles ───────────────────────────────────────────────────
function ProfilesWidget() {
  const [items, setItems] = useState<LatestProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('user_id, full_name, professional_type, location, avatar_url')
      .eq('is_public', true)
      .not('professional_type', 'in', '("manufacturer","brand","supplier")')
      .order('profile_views', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        setItems((data ?? []) as LatestProfile[]);
        setLoading(false);
      });
  }, []);

  return (
    <Widget icon={Users} title="Latest Profiles" viewAllLink="/discover" loading={loading} empty={items.length === 0}>
      {items.map((profile) => (
        <Link key={profile.user_id} to={`/u/${profile.user_id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <ImageThumb src={profile.avatar_url} fallback={profile.full_name || 'U'} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{profile.full_name || 'Anonymous'}</p>
            <p className="text-xs text-muted-foreground truncate">
              {profile.professional_type ? (PROF_LABELS[profile.professional_type] ?? profile.professional_type) : ''}
              {profile.location ? ` · ${profile.location}` : ''}
            </p>
          </div>
        </Link>
      ))}
    </Widget>
  );
}

// ── Widget: Latest Factories ──────────────────────────────────────────────────
function FactoriesWidget() {
  const [items, setItems] = useState<LatestFactory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('user_id, full_name, company, professional_type, location, avatar_url')
      .eq('is_public', true)
      .in('professional_type', ['manufacturer', 'brand', 'supplier'])
      .order('profile_views', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        setItems((data ?? []) as LatestFactory[]);
        setLoading(false);
      });
  }, []);

  return (
    <Widget icon={Factory} title="Latest Factories" viewAllLink="/agent-hub?prompt=Show me the latest manufacturers, brands and suppliers on the platform" loading={loading} empty={items.length === 0}>
      {items.map((f) => (
        <Link key={f.user_id} to={`/u/${f.user_id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <ImageThumb src={f.avatar_url} fallback={f.company || f.full_name || 'F'} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{f.company || f.full_name || 'Unknown'}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {f.professional_type ? (PROF_LABELS[f.professional_type] ?? f.professional_type) : ''}
              {f.location && (
                <>
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  {f.location}
                </>
              )}
            </p>
          </div>
        </Link>
      ))}
    </Widget>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export const LatestWidgets: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
    <MaterialsWidget />
    <KnowledgeWidget />
    <ProfilesWidget />
    <FactoriesWidget />
  </div>
);
