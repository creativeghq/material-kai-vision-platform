import { supabase } from '@/integrations/supabase/client';

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function transcribeRecording(
  scope: { projectId: string } | { workspaceId: string },
  recording: Blob,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('structure-site-note', {
    body: {
      ...('projectId' in scope ? { project_id: scope.projectId } : { workspace_id: scope.workspaceId }),
      audio_base64: await blobToBase64(recording),
      audio_type: recording.type,
      transcribe_only: true,
    },
  });
  if (error) throw new Error(error.message || 'The recording could not be transcribed.');
  if (!data?.success || typeof data.transcript !== 'string') throw new Error(data?.error || 'The recording could not be transcribed.');
  return data.transcript;
}
