import { describe, it, expect } from 'vitest';
import {
  collectConversationMedia, conversationMediaContext, resolveMediaSource, stillsOf,
} from '../../supabase/functions/_shared/conversation-media.ts';

const u = (n: string) => `https://x.test/${n}.jpg`;

describe('every generated result can feed the next generator', () => {
  const history = [
    { role: 'user', content: 'stage it', images: [u('upload')] },
    { role: 'assistant', content: '', geminiImageData: { image_url: u('render'), mode: 'scene-render' } },
    { role: 'assistant', content: '', metadata: { virtualStagingData: { image_url: u('staged') } } },
    { role: 'assistant', content: '', materialsBoardData: { image_url: u('board') } },
    { role: 'assistant', content: '', metadata: { videoData: { video_url: 'https://x.test/v.mp4', video_type: 'walkthrough' } } },
    { role: 'assistant', content: '', tool_results: [{ image_url: u('render') }] },
  ];

  it('reads results live and restored from metadata, in order, once each', () => {
    const media = collectConversationMedia(history);
    expect(media.map((m) => m.kind)).toEqual(['image', 'staging', 'board', 'video']);
    expect(media[0].label).toBe('scene-render');
  });

  it('a staged room is the newest still, so "now animate it" acts on it, not on the render before', () => {
    const stills = stillsOf(collectConversationMedia(history.slice(0, 3)));
    expect(resolveMediaSource({ conversationImages: stills }).url).toBe(u('staged'));
  });

  it('videos are listed for the agent but never handed to an image tool', () => {
    const media = collectConversationMedia(history);
    expect(stillsOf(media)).not.toContain('https://x.test/v.mp4');
    expect(conversationMediaContext(media)).toContain('video (walkthrough)');
  });

  it('an explicit URL wins, then my_upload, then the newest still', () => {
    expect(resolveMediaSource({ sourceImageUrl: u('a'), conversationImages: [u('b')] }).url).toBe(u('a'));
    expect(resolveMediaSource({ source: 'my_upload', uploadedRoom: u('up'), conversationImages: [u('b')] }).url).toBe(u('up'));
    expect(resolveMediaSource({ conversationImages: [], uploadedRoom: u('up') }).url).toBe(u('up'));
    expect(resolveMediaSource({ conversationImages: [] }).url).toBeUndefined();
  });

  it('user turns and non-URLs are ignored', () => {
    expect(collectConversationMedia([{ role: 'user', geminiImageData: { image_url: u('x') } }, { role: 'assistant', geminiImageData: { image_url: 'data:abc' } }])).toEqual([]);
  });
});
