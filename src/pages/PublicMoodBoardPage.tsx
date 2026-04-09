/**
 * Public Moodboard View
 * Read-only view of a shared moodboard. No auth required.
 * Route: /board/:id
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Palette, ExternalLink, Lock, ArrowRight } from 'lucide-react';

interface PublicBoard {
  id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

interface PublicItem {
  id: string;
  notes: string | null;
  media_url: string | null;
  media_type: string | null;
  material_id: string | null;
  material?: {
    name: string;
    description: string | null;
    thumbnail_url: string | null;
    category: string | null;
    manufacturer: string | null;
  } | null;
}

export default function PublicMoodBoardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [items, setItems] = useState<PublicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: boardData, error: boardError } = await supabase
        .from('moodboards')
        .select('id, title, description, is_public, created_at')
        .eq('id', id)
        .eq('is_public', true)
        .single();

      if (boardError || !boardData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setBoard(boardData);

      const { data: itemsData } = await supabase
        .from('moodboard_items')
        .select(`
          id, notes, media_url, media_type, material_id,
          material:products(name, description, thumbnail_url, category, manufacturer)
        `)
        .eq('moodboard_id', id)
        .order('created_at', { ascending: true });

      setItems((itemsData as unknown as PublicItem[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-2xl font-light text-primary">Board not available</h1>
          <p className="text-muted-foreground text-sm max-w-sm">
            This moodboard is private or doesn't exist. Ask the owner to make it public and share the link again.
          </p>
          <Button className="rounded-full gap-2" onClick={() => navigate('/')}>
            Go to platform
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  const materialItems = items.filter((i) => i.material_id && i.material);
  const mediaItems = items.filter((i) => i.media_url && !i.material_id);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-64 md:h-80 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/40 overflow-hidden">
        {/* Try first material thumbnail as hero */}
        {materialItems[0]?.material?.thumbnail_url && (
          <img
            src={materialItems[0].material.thumbnail_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Branding badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
          <Palette className="h-3.5 w-3.5 text-white/80" />
          <span className="text-white/80 text-xs font-medium">Materials Hub</span>
        </div>

        {/* Sign up CTA */}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 rounded-full gap-1.5 bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
          onClick={() => navigate('/auth')}
        >
          Create your own
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>

        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
          <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight drop-shadow-lg">
            {board!.title}
          </h1>
          {board!.description && (
            <p className="text-white/70 text-sm mt-1 max-w-2xl line-clamp-2">{board!.description}</p>
          )}
          <p className="text-white/40 text-xs mt-2">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Items grid */}
      <div className="px-4 md:px-6 py-8 max-w-7xl mx-auto space-y-8">
        {materialItems.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Materials ({materialItems.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {materialItems.map((item) => (
                <div
                  key={item.id}
                  className="dashboard-card overflow-hidden group"
                >
                  <div className="h-40 bg-muted overflow-hidden">
                    {item.material?.thumbnail_url ? (
                      <img
                        src={item.material.thumbnail_url}
                        alt={item.material.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-medium line-clamp-2 leading-snug">
                      {item.material!.name}
                    </p>
                    {item.material?.category && (
                      <Badge variant="secondary" className="text-xs">{item.material.category}</Badge>
                    )}
                    {item.notes && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2 mt-1">
                        "{item.notes}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {mediaItems.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Media ({mediaItems.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {mediaItems.map((item) => (
                <div key={item.id} className="dashboard-card overflow-hidden">
                  {item.media_type === 'video' ? (
                    <video src={item.media_url!} controls className="w-full h-48 object-cover" />
                  ) : (
                    <img src={item.media_url!} alt="Media" className="w-full h-48 object-cover" loading="lazy" />
                  )}
                  {item.notes && (
                    <p className="p-3 text-xs text-muted-foreground italic">"{item.notes}"</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            This moodboard is empty.
          </div>
        )}

        {/* Footer CTA */}
        <div className="text-center py-8 border-t border-border/40 space-y-3">
          <p className="text-sm text-muted-foreground">
            Create your own moodboards and discover materials on Materials Hub
          </p>
          <Button className="rounded-full gap-2" onClick={() => navigate('/auth')}>
            <Palette className="h-4 w-4" />
            Get started free
          </Button>
        </div>
      </div>
    </div>
  );
}
