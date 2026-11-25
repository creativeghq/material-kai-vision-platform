export const canEncodeVideo = (): boolean => typeof VideoEncoder !== 'undefined';

export async function encodeVideo(canvas: HTMLCanvasElement, fps: number, total: number, draw: (i: number) => Promise<boolean | void> | boolean | void): Promise<Blob | null> {
  if (!canEncodeVideo()) throw new Error('This browser cannot make video.');
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat, canEncodeVideo: supports } = await import('mediabunny');
  const avc = await supports('avc', { width: canvas.width, height: canvas.height });
  const target = new BufferTarget();
  const output = new Output({ format: avc ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: avc ? 'avc' : 'vp9', bitrate: 8_000_000 });
  output.addVideoTrack(video, { frameRate: fps });
  await output.start();
  for (let i = 0; i < total; i++) {
    if (await draw(i) === false) { await output.cancel(); return null; }
    await video.add(i / fps, 1 / fps);
  }
  await output.finalize();
  return new Blob([target.buffer as ArrayBuffer], { type: avc ? 'video/mp4' : 'video/webm' });
}
