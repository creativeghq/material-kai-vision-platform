export const COMPOSER_MAX_FILES = 10;
/** Base64 inflates by a third, so 20 MB of files is ~27 MB on the wire and stays under email's 25 MB of attachments once decoded. */
export const COMPOSER_MAX_BYTES = 20 * 1024 * 1024;

/** A social reply relays text only, so a file there would show in our transcript and never reach anyone. */
export function composerTakesFiles(channel: string | null | undefined, isNote: boolean): boolean {
  return isNote || channel !== 'social';
}

export function addComposerFiles(current: File[], incoming: File[]): { files: File[]; refused: string | null } {
  const files = [...current];
  let refused: string | null = null;
  let total = files.reduce((n, f) => n + f.size, 0);
  for (const f of incoming) {
    if (files.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) continue;
    if (files.length >= COMPOSER_MAX_FILES) { refused = `Up to ${COMPOSER_MAX_FILES} files per message.`; break; }
    if (total + f.size > COMPOSER_MAX_BYTES) { refused = `${f.name} would take this message over 20 MB of files.`; continue; }
    files.push(f);
    total += f.size;
  }
  return { files, refused };
}

export async function fileToAttachment(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { filename: file.name, content_type: file.type || 'application/octet-stream', data_base64: btoa(bin) };
}

export const encodeAttachments = (files: File[]) => Promise.all(files.map(fileToAttachment));
