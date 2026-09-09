import { setTimeout as nodeSleep } from 'node:timers/promises';

// Meta Graph API v23 "Reels Publishing" flow for Facebook Pages.
export const FB_GRAPH = 'https://graph.facebook.com/v23.0';
export const FB_UPLOAD = 'https://rupload.facebook.com/video-upload/v23.0';

export type FacebookEnv = { pageId: string; accessToken: string };

export function facebookStartParams(token: string): URLSearchParams {
  return new URLSearchParams({ upload_phase: 'start', access_token: token });
}

// The upload step hands Facebook a hosted URL to fetch (file_url) instead of
// streaming the video ourselves, so the request carries headers only, no body.
export function facebookUploadHeaders(token: string, fileUrl: string): Record<string, string> {
  return { Authorization: `OAuth ${token}`, file_url: fileUrl };
}

export function facebookFinishParams(caption: string, videoId: string, token: string): URLSearchParams {
  return new URLSearchParams({
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: caption,
    access_token: token,
  });
}

export type FacebookDeps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void> };

type FacebookVideoStatus = { video_status?: string; publishing_phase?: { status?: string } };

async function fbFetch(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // `url` is deliberately never interpolated into this message — polling URLs
  // carry access_token as a query param and must not leak into thrown errors.
  if (!res.ok) throw new Error(`Facebook API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export async function postFacebook(
  videoUrl: string,
  env: FacebookEnv,
  caption: string,
  deps?: Partial<FacebookDeps>,
): Promise<string> {
  const fetchImpl = deps?.fetch ?? globalThis.fetch;
  const sleep = deps?.sleep ?? ((ms: number) => nodeSleep(ms));

  const start = await fbFetch(fetchImpl, `${FB_GRAPH}/${env.pageId}/video_reels`, {
    method: 'POST',
    body: facebookStartParams(env.accessToken),
  });
  const videoId = String(start.video_id ?? '');
  if (!videoId) throw new Error(`no video id in ${JSON.stringify(start)}`);

  await fbFetch(fetchImpl, `${FB_UPLOAD}/${videoId}`, {
    method: 'POST',
    headers: facebookUploadHeaders(env.accessToken, videoUrl),
  });

  await fbFetch(fetchImpl, `${FB_GRAPH}/${env.pageId}/video_reels`, {
    method: 'POST',
    body: facebookFinishParams(caption, videoId, env.accessToken),
  });

  // Facebook processes the uploaded reel asynchronously; only report success
  // once it says the video is ready or the publishing phase is complete.
  let ready = false;
  let lastStatus: FacebookVideoStatus = {};
  for (let i = 0; i < 30 && !ready; i++) {
    await sleep(10_000);
    const check = await fbFetch(
      fetchImpl,
      `${FB_GRAPH}/${videoId}?fields=status&access_token=${encodeURIComponent(env.accessToken)}`,
    );
    lastStatus = (check.status ?? {}) as FacebookVideoStatus;
    if (lastStatus.video_status === 'error') {
      throw new Error(`Facebook video processing error: ${JSON.stringify(lastStatus)}`);
    }
    ready = lastStatus.video_status === 'ready' || lastStatus.publishing_phase?.status === 'complete';
  }
  if (!ready) throw new Error(`Facebook video not ready after 5 minutes (status ${JSON.stringify(lastStatus)})`);

  return videoId;
}
