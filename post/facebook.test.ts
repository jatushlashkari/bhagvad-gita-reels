import { describe, it, expect } from 'vitest';
import { FB_GRAPH, FB_UPLOAD, facebookFinishParams, facebookStartParams, facebookUploadHeaders, postFacebook } from './facebook.ts';

describe('facebook reels param builders', () => {
  it('start / upload / finish', () => {
    expect(facebookStartParams('T').get('upload_phase')).toBe('start');
    expect(facebookStartParams('T').get('access_token')).toBe('T');
    expect(facebookUploadHeaders('T', 'https://x/reel.mp4')).toEqual({ Authorization: 'OAuth T', file_url: 'https://x/reel.mp4' });
    const f = facebookFinishParams('hello', 'V1', 'T');
    expect(f.get('upload_phase')).toBe('finish');
    expect(f.get('video_id')).toBe('V1');
    expect(f.get('video_state')).toBe('PUBLISHED');
    expect(f.get('description')).toBe('hello');
    expect(f.get('access_token')).toBe('T');
  });
});

// `bodyIncludes` is optional and only needed when two script entries share a
// `match` (start and finish both POST to `.../video_reels`) — it picks the
// entry whose expected substring is present in the outgoing request body, so
// each call can be answered with its own response instead of reusing the
// first match found by URL alone.
function fakeFetch(script: Array<{ match: RegExp; body: unknown; status?: number; bodyIncludes?: string }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reqBody = String(init?.body ?? '');
    const step =
      script.find((s) => s.bodyIncludes !== undefined && s.match.test(url) && reqBody.includes(s.bodyIncludes)) ??
      script.find((s) => s.bodyIncludes === undefined && s.match.test(url));
    if (!step) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(step.body), { status: step.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('postFacebook', () => {
  const env = { pageId: 'PAGE', accessToken: 'T' };
  it('runs start → upload → finish → status ready and returns the video id', async () => {
    const { fetch, calls } = fakeFetch([
      { match: /\/PAGE\/video_reels$/, bodyIncludes: 'upload_phase=start', body: { video_id: 'V1', upload_url: 'u' } },
      { match: /rupload\.facebook\.com\/video-upload\/v23\.0\/V1$/, body: { success: true } },
      { match: /\/PAGE\/video_reels$/, bodyIncludes: 'upload_phase=finish', body: { success: true } },
      { match: /\/V1\?fields=status/, body: { status: { video_status: 'ready' } } },
    ]);
    const id = await postFacebook('https://x/reel.mp4', env, 'cap', { fetch, sleep: async () => {} });
    expect(id).toBe('V1');
    expect(calls[0].url).toBe(`${FB_GRAPH}/PAGE/video_reels`);
    expect(String(calls[0].init?.body)).toContain('upload_phase=start');
    expect(calls[1].url).toBe(`${FB_UPLOAD}/V1`);
    expect((calls[1].init?.headers as Record<string, string>).file_url).toBe('https://x/reel.mp4');
    expect(String(calls[2].init?.body)).toContain('upload_phase=finish');
    expect(String(calls[2].init?.body)).toContain('video_state=PUBLISHED');
    expect(calls[3].url).toContain('/V1?fields=status');
  });
  it('throws on an API error and on a processing error', async () => {
    const bad = fakeFetch([{ match: /video_reels$/, body: { error: { message: 'nope' } }, status: 400 }]);
    await expect(postFacebook('https://x/r.mp4', env, 'c', { fetch: bad.fetch, sleep: async () => {} })).rejects.toThrow(/400/);
    const err = fakeFetch([
      { match: /\/PAGE\/video_reels$/, bodyIncludes: 'upload_phase=start', body: { video_id: 'V1' } },
      { match: /rupload/, body: { success: true } },
      { match: /\/PAGE\/video_reels$/, bodyIncludes: 'upload_phase=finish', body: { success: true } },
      { match: /fields=status/, body: { status: { video_status: 'error', processing_phase: { error: 'bad file' } } } },
    ]);
    await expect(postFacebook('https://x/r.mp4', env, 'c', { fetch: err.fetch, sleep: async () => {} })).rejects.toThrow(/error/);
  });
  it('throws when the upload call reports success: false', async () => {
    const bad = fakeFetch([
      { match: /\/PAGE\/video_reels$/, body: { video_id: 'V1' } },
      { match: /rupload/, body: { success: false } },
    ]);
    await expect(postFacebook('https://x/r.mp4', env, 'c', { fetch: bad.fetch, sleep: async () => {} })).rejects.toThrow(
      /upload failed/,
    );
  });
  it('throws when the finish call reports success: false', async () => {
    const bad = fakeFetch([
      { match: /\/PAGE\/video_reels$/, bodyIncludes: 'upload_phase=start', body: { video_id: 'V1' } },
      { match: /rupload/, body: { success: true } },
      { match: /\/PAGE\/video_reels$/, bodyIncludes: 'upload_phase=finish', body: { success: false } },
    ]);
    await expect(postFacebook('https://x/r.mp4', env, 'c', { fetch: bad.fetch, sleep: async () => {} })).rejects.toThrow(
      /finish failed/,
    );
  });
});
