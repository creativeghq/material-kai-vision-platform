import { supabase } from '@/integrations/supabase/client';
import type { SceneMaterial } from '@/lib/scene/sceneMaterials';

let library: Promise<SceneMaterial[]> | null = null;

/** The platform's material library, read once per visit; a failed read is tried again by the next room. */
export function sceneMaterials(): Promise<SceneMaterial[]> {
  library ??= read();
  library.catch(() => { library = null; });
  return library;
}

async function read(): Promise<SceneMaterial[]> {
  const { data, error } = await supabase.from('scene_materials')
    .select('key, label, kind, roles, words, storage_bucket, albedo_path, normal_path, roughness_path, tile_mm, mean_linear, tint_only, normal_scale, roughness_factor, priority')
    .eq('is_active', true);
  if (error) throw new Error(`Materials could not be loaded: ${error.message}`);
  return (data ?? []).map((m) => {
    const url = (path: string) => supabase.storage.from(m.storage_bucket).getPublicUrl(path).data.publicUrl;
    const [r, g, b] = m.mean_linear.map(Number);
    return {
      key: m.key, label: m.label, kind: m.kind as SceneMaterial['kind'], roles: m.roles, words: m.words,
      albedoUrl: url(m.albedo_path), normalUrl: url(m.normal_path), roughnessUrl: url(m.roughness_path),
      tileM: m.tile_mm / 1000, mean: [r, g, b], tintOnly: m.tint_only,
      normalScale: Number(m.normal_scale), roughnessFactor: Number(m.roughness_factor), priority: m.priority,
    };
  });
}
